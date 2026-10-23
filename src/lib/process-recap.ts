import { prisma } from "./prisma";
import { forSquad, type SquadPrisma } from "./tenant-prisma";
import { getGroq, GROQ_MODEL } from "./groq";
import { generateJsonWithGemini } from "./gemini";
import { getRecapAiConfig, getAltRecapAiConfig, type RecapAiConfig } from "./ai-provider";
import { log } from "./logger";
import { findDuplicateNote } from "./duplicate-detection";

type SuggestedTask = {
  title?: string;
  description?: string;
  assignee?: string;
  priority?: string;
  dueDate?: string | null;
  deliverTo?: string;
};

// poucos-exemplos são do MESMO squad do recap sendo processado — sem isso, o padrão de
// escrita/aceite de um squad vazaria pro prompt de outro squad
async function buildFewShotExamples(db: SquadPrisma, squadId: string): Promise<string> {
  const [accepted, rejected] = await Promise.all([
    db.recapSuggestion.findMany({
      where: { status: { in: ["accepted", "edited"] }, recap: { squadId } },
      include: { task: { select: { title: true, description: true, priority: true } } },
      orderBy: { updatedAt: "desc" },
      take: 8,
    }),
    db.recapSuggestion.findMany({
      where: { status: "rejected", recap: { squadId } },
      orderBy: { updatedAt: "desc" },
      take: 5,
    }),
  ]);

  let text = "";
  if (accepted.length > 0) {
    text += `\nExemplos de tarefas que esta equipe já aceitou de recaps anteriores (siga o mesmo padrão de escrita e nível de detalhe — repare quando o título final ficou diferente do sugerido, é o formato que preferem):\n`;
    for (const s of accepted) {
      if (!s.task) continue;
      text += `- sugerido: "${s.title}" → aceito como: "${s.task.title}" (prioridade: ${s.task.priority})\n`;
    }
  }
  if (rejected.length > 0) {
    text += `\nExemplos de sugestões que a equipe REJEITOU antes (evite extrair esse tipo de item — geralmente vago, redundante ou não é uma ação real):\n`;
    for (const s of rejected) {
      text += `- "${s.title}"\n`;
    }
  }
  return text;
}

// Chama o provedor de IA com o prompt e devolve as tarefas já parseadas — usado tanto
// pro provedor principal (vira RecapSuggestion de verdade) quanto pro "outro" provedor
// disponível (só comparação, ver getAltRecapAiConfig).
async function extractTasksWithProvider(
  aiConfig: RecapAiConfig,
  prompt: string
): Promise<{ client: string | null; tasks: SuggestedTask[] }> {
  let raw: string;
  if (aiConfig.provider === "gemini") {
    raw = (await generateJsonWithGemini(aiConfig.apiKey, prompt)) || "{}";
  } else {
    const completion = await getGroq().chat.completions.create({
      model: GROQ_MODEL,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.1,
      // mesmo motivo do maxOutputTokens do Gemini (ver src/lib/gemini.ts) — a ata completa
      // dá mais contexto pra achar tarefa, lista fica mais longa, 2048 cortava o JSON
      max_tokens: 8192,
    });
    raw = completion.choices[0]?.message?.content || "{}";
  }
  console.log(`[${aiConfig.provider}] resposta bruta:`, raw.slice(0, 800));
  const text = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    const result: { client?: string; tasks?: SuggestedTask[] } = JSON.parse(jsonMatch[0]);
    return { client: result.client || null, tasks: result.tasks || [] };
  }
  const arrayMatch = text.match(/\[[\s\S]*\]/);
  if (!arrayMatch) throw new Error(`JSON não encontrado na resposta do ${aiConfig.provider}`);
  return { client: null, tasks: JSON.parse(arrayMatch[0]) };
}

// Marca superseded as sugestões ainda pendentes de uma leva anterior (preserva aceitas/editadas/rejeitadas como histórico)
async function supersedePendingSuggestions(db: SquadPrisma, recapId: string) {
  await db.recapSuggestion.updateMany({
    where: { recapId, status: "pending" },
    data: { status: "superseded" },
  });
}

/**
 * Processa um Meet Recap: extrai sugestões de tarefa via IA e grava em RecapSuggestion.
 * NÃO cria Task nenhuma — isso só acontece quando o usuário clica "Adicionar" na tela.
 * `force`: reprocessa mesmo se já foi processado antes (usado pelo botão de reprocessar).
 */
export type ProcessRecapResult = {
  count: number;
  // preenchido só quando a IA falhou de verdade (quota, API fora do ar, chave
  // inválida) — diferente de "processou certinho e não achou nenhuma tarefa"
  // (count: 0 sem error). Quem chama usa isso pra não mostrar "nenhuma tarefa
  // identificada" quando na verdade a chamada nem completou.
  error?: string;
};

export async function processRecap(recapId: string, opts?: { force?: boolean }): Promise<ProcessRecapResult> {
  // busca sem escopo — squadId ainda não é conhecido nesse ponto; é o próprio recap
  // encontrado aqui que informa qual squad usar dali em diante
  const recap = await prisma.meetRecap.findUnique({ where: { id: recapId } });
  if (!recap) return { count: 0 };
  if (recap.processedAt && !opts?.force) return { count: 0 };

  const db = forSquad(recap.squadId);

  if (!recap.body || recap.body.trim().length < 20) {
    await db.meetRecap.update({ where: { id: recapId }, data: { suggestedTasks: "[]", processedAt: new Date() } });
    return { count: 0 };
  }

  const users = await db.user.findMany({ select: { id: true, name: true, email: true } });
  const memberList = users.map((u) => u.name || u.email).join(", ");
  const fewShot = await buildFewShotExamples(db, recap.squadId);

  const prompt = `Você é um assistente de gestão de tarefas para a empresa O2 Inc. Analise o conteúdo abaixo (transcrição, resumo ou lista de próximas etapas de reunião) e extraia TODAS as tarefas e compromissos.

Membros do squad O2: ${memberList}

Conteúdo:
${recap.body.slice(0, 5000)}

Instruções:
- Identifique o nome do cliente da reunião se mencionado (ex: "Fismatek", "Zé do Flor")
- Para cada tarefa identifique quem deve entregar: "client" se é o cliente que entrega para a O2, "o2" se é a O2 que entrega para o cliente, "internal" se é tarefa interna
- "assignee": APENAS se o nome de um destes membros for explicitamente mencionado como responsável: ${memberList}. Se não for mencionado explicitamente, use string vazia "". NUNCA invente um responsável.
- Prazos: converta para YYYY-MM-DD considerando hoje = ${new Date().toISOString().split("T")[0]}
- priority: "high" se urgente, "medium" como padrão, "low" sem urgência
${fewShot}
Retorne APENAS JSON válido sem markdown, sem blocos de código, sem explicações:
{
  "client": "nome do cliente ou null",
  "tasks": [
    {
      "title": "título objetivo (máx 80 chars)",
      "description": "contexto adicional",
      "assignee": "nome do membro do squad ou string vazia",
      "priority": "high|medium|low",
      "dueDate": "YYYY-MM-DD ou null",
      "deliverTo": "o2|client|internal"
    }
  ]
}`;

  const aiConfig = await getRecapAiConfig(recap.squadId);

  try {
    const { client, tasks } = await extractTasksWithProvider(aiConfig, prompt);

    await supersedePendingSuggestions(db, recapId);

    // melhor-esforço: roda o OUTRO modelo disponível (se houver) com o mesmo prompt, só
    // pra comparação lado a lado em /sugestoes-ia — nunca vira RecapSuggestion, nunca
    // impede o processamento principal de concluir se falhar (quota, chave inválida etc.)
    let altProvider: string | null = null;
    let altSuggestedTasks: string | null = null;
    const altConfig = await getAltRecapAiConfig(recap.squadId, aiConfig);
    if (altConfig) {
      try {
        const alt = await extractTasksWithProvider(altConfig, prompt);
        altProvider = altConfig.provider;
        altSuggestedTasks = JSON.stringify(alt.tasks);
      } catch (altErr) {
        await log("ia-recap", `Comparação com o outro modelo (${altConfig.provider}) falhou — ignorado`, {
          detail: String(altErr),
          squadId: recap.squadId,
        });
      }
    }

    await db.meetRecap.update({
      where: { id: recapId },
      data: {
        suggestedTasks: JSON.stringify(tasks),
        processedAt: new Date(),
        client,
        altProvider,
        altSuggestedTasks,
      },
    });

    const validTasks = tasks.filter((t) => t.title?.trim());
    if (validTasks.length > 0) {
      const duplicateNotes = await Promise.all(
        validTasks.map((t) => findDuplicateNote(recap.squadId, t.title!, client, t.dueDate ? new Date(t.dueDate) : null))
      );
      await db.recapSuggestion.createMany({
        data: validTasks.map((t, index) => ({
          recapId,
          index,
          title: t.title!.slice(0, 255),
          description: t.description || null,
          assignee: t.assignee || null,
          priority: ["high", "medium", "low"].includes(t.priority ?? "") ? t.priority! : "medium",
          dueDate: t.dueDate ? new Date(t.dueDate) : null,
          status: duplicateNotes[index] ? "duplicate" : "pending",
          duplicateNote: duplicateNotes[index],
        })),
      });
    }

    console.log(`[process-recap] client="${client}", ${validTasks.length} sugestão(ões)`);
    await log("ia-recap", `Meet Recap processado pela IA (${aiConfig.provider}) — ${validTasks.length} sugestão(ões) de tarefa identificada(s)`, {
      detail: client ? `Cliente: ${client}` : undefined,
      squadId: recap.squadId,
    });

    return { count: validTasks.length };
  } catch (err) {
    // Falha do Gemini (chave inválida, quota) NÃO cai pro Groq silenciosamente — loga
    // e esse ciclo falha, igual já acontecia quando a própria Groq falhava. Quem
    // conectou a chave precisa saber que ela parou de funcionar, não ter o app
    // mascarando isso trocando de provedor sem avisar.
    const message = err instanceof Error ? err.message : String(err);
    await log("ia-recap", `Erro ao processar Meet Recap com IA (${aiConfig.provider})`, {
      level: "error",
      detail: message,
      squadId: recap.squadId,
    });
    console.error("[process-recap] erro:", err);
    return { count: 0, error: `Erro ao chamar a IA (${aiConfig.provider}): ${message}` };
  }
}
