import { prisma } from "./prisma";
import Groq from "groq-sdk";
import { log } from "./logger";

let groq: Groq | null = null;
function getGroq() {
  if (!groq) groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
  return groq;
}

type SuggestedTask = {
  title?: string;
  description?: string;
  assignee?: string;
  priority?: string;
  dueDate?: string | null;
  deliverTo?: string;
};

async function buildFewShotExamples(): Promise<string> {
  const [accepted, rejected] = await Promise.all([
    prisma.recapSuggestion.findMany({
      where: { status: { in: ["accepted", "edited"] } },
      include: { task: { select: { title: true, description: true, priority: true } } },
      orderBy: { updatedAt: "desc" },
      take: 8,
    }),
    prisma.recapSuggestion.findMany({
      where: { status: "rejected" },
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

// Marca superseded as sugestões ainda pendentes de uma leva anterior (preserva aceitas/editadas/rejeitadas como histórico)
async function supersedePendingSuggestions(recapId: string) {
  await prisma.recapSuggestion.updateMany({
    where: { recapId, status: "pending" },
    data: { status: "superseded" },
  });
}

/**
 * Processa um Meet Recap: extrai sugestões de tarefa via IA e grava em RecapSuggestion.
 * NÃO cria Task nenhuma — isso só acontece quando o usuário clica "Adicionar" na tela.
 * `force`: reprocessa mesmo se já foi processado antes (usado pelo botão de reprocessar).
 */
export async function processRecap(recapId: string, opts?: { force?: boolean }): Promise<number> {
  const recap = await prisma.meetRecap.findUnique({ where: { id: recapId } });
  if (!recap) return 0;
  if (recap.processedAt && !opts?.force) return 0;

  if (!recap.body || recap.body.trim().length < 20) {
    await prisma.meetRecap.update({ where: { id: recapId }, data: { suggestedTasks: "[]", processedAt: new Date() } });
    return 0;
  }

  const users = await prisma.user.findMany({ select: { id: true, name: true, email: true } });
  const memberList = users.map((u) => u.name || u.email).join(", ");
  const fewShot = await buildFewShotExamples();

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

  try {
    const completion = await getGroq().chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.1,
      max_tokens: 2048,
    });

    const raw = completion.choices[0]?.message?.content || "{}";
    console.log("[groq] resposta bruta:", raw.slice(0, 800));
    const text = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();

    let tasks: SuggestedTask[] = [];
    let client: string | null = null;

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const result: { client?: string; tasks?: SuggestedTask[] } = JSON.parse(jsonMatch[0]);
      tasks = result.tasks || [];
      client = result.client || null;
    } else {
      const arrayMatch = text.match(/\[[\s\S]*\]/);
      if (!arrayMatch) throw new Error("JSON não encontrado na resposta do Groq");
      tasks = JSON.parse(arrayMatch[0]);
    }

    await supersedePendingSuggestions(recapId);

    await prisma.meetRecap.update({
      where: { id: recapId },
      data: {
        suggestedTasks: JSON.stringify(tasks),
        processedAt: new Date(),
        client,
      },
    });

    const validTasks = tasks.filter((t) => t.title?.trim());
    if (validTasks.length > 0) {
      await prisma.recapSuggestion.createMany({
        data: validTasks.map((t, index) => ({
          recapId,
          index,
          title: t.title!.slice(0, 255),
          description: t.description || null,
          assignee: t.assignee || null,
          priority: ["high", "medium", "low"].includes(t.priority ?? "") ? t.priority! : "medium",
          dueDate: t.dueDate ? new Date(t.dueDate) : null,
        })),
      });
    }

    console.log(`[process-recap] client="${client}", ${validTasks.length} sugestão(ões)`);
    await log("ia-recap", `Meet Recap processado pela IA — ${validTasks.length} sugestão(ões) de tarefa identificada(s)`, {
      detail: client ? `Cliente: ${client}` : undefined,
    });

    return validTasks.length;
  } catch (err) {
    await log("ia-recap", "Erro ao processar Meet Recap com IA", {
      level: "error",
      detail: String(err),
    });
    console.error("[process-recap] erro:", err);
    return 0;
  }
}
