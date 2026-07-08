import { prisma } from "./prisma";
import Groq from "groq-sdk";
import { log } from "./logger";

let groq: Groq | null = null;
function getGroq() {
  if (!groq) groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
  return groq;
}

export async function processRecap(recapId: string): Promise<number> {
  const recap = await prisma.meetRecap.findUnique({ where: { id: recapId } });
  if (!recap || recap.processedAt) return 0;
  if (!recap.body || recap.body.trim().length < 20) {
    await prisma.meetRecap.update({ where: { id: recapId }, data: { suggestedTasks: "[]", processedAt: new Date() } });
    return 0;
  }

  const users = await prisma.user.findMany({ select: { id: true, name: true, email: true } });
  const memberList = users.map((u) => u.name || u.email).join(", ");

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
    // strip markdown code blocks se existirem
    const text = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      // tenta array direto (formato antigo)
      const arrayMatch = text.match(/\[[\s\S]*\]/);
      if (arrayMatch) {
        const tasks = JSON.parse(arrayMatch[0]);
        console.log("[groq] formato array detectado, tarefas:", tasks.length);
        await prisma.meetRecap.update({
          where: { id: recapId },
          data: { suggestedTasks: arrayMatch[0], processedAt: new Date() },
        });
        // processa como array sem client
        let created = 0;
        for (const task of tasks) {
          if (!task.title?.trim()) continue;
          let assigneeId: string | null = null;
          if (task.assignee?.trim()) {
            const nameLower = task.assignee.toLowerCase().trim();
            const match = users.find((u) => {
              const userName = (u.name || "").toLowerCase();
              return userName.includes(nameLower) || nameLower.includes(userName.split(" ")[0]);
            });
            if (match) assigneeId = match.id;
          }
          const createdById = users[0]?.id;
          if (!createdById) continue;
          await prisma.task.create({
            data: {
              title: task.title.slice(0, 255),
              description: task.description || null,
              priority: ["high","medium","low"].includes(task.priority) ? task.priority : "medium",
              status: "todo",
              assigneeId,
              createdById,
              source: "meet_recap",
              sourceRef: recapId,
              dueDate: task.dueDate ? new Date(task.dueDate) : null,
            },
          });
          created++;
        }
        return created;
      }
      throw new Error("JSON não encontrado na resposta do Groq");
    }

    const result: { client?: string; tasks?: any[] } = JSON.parse(jsonMatch[0]);
    const tasks = result.tasks || [];
    const client = result.client || null;

    await prisma.meetRecap.update({
      where: { id: recapId },
      data: {
        suggestedTasks: JSON.stringify(tasks),
        processedAt: new Date(),
        client,
      },
    });

    console.log(`[process-recap] client="${client}", ${tasks.length} tarefa(s)`);
    await log("ia-recap", `Meet Recap processado pela IA — ${tasks.length} tarefa(s) identificada(s)`, {
      detail: client ? `Cliente: ${client}` : undefined,
    });

    let created = 0;
    for (const task of tasks) {
      if (!task.title?.trim()) continue;

      let assigneeId: string | null = null;
      if (task.assignee && task.assignee.trim() !== "") {
        const nameLower = task.assignee.toLowerCase().trim();
        const match = users.find((u) => {
          const userName = (u.name || "").toLowerCase();
          const userEmail = u.email.toLowerCase();
          const userFirstName = userName.split(" ")[0];
          return (
            userName.includes(nameLower) ||
            nameLower.includes(userName) ||
            nameLower.includes(userFirstName) ||
            userFirstName.includes(nameLower) ||
            userEmail.includes(nameLower) ||
            nameLower.includes(userEmail.split("@")[0])
          );
        });
        if (match) {
          assigneeId = match.id;
          console.log(`  ✓ match: "${task.assignee}" → ${match.name}`);
        } else {
          console.log(`  ✗ sem match para: "${task.assignee}"`);
        }
      }

      const createdById = users[0]?.id;
      if (!createdById) continue;

      await prisma.task.create({
        data: {
          title: task.title.slice(0, 255),
          description: task.description || null,
          priority: ["high", "medium", "low"].includes(task.priority) ? task.priority : "medium",
          status: "todo",
          assigneeId,
          createdById,
          source: "meet_recap",
          sourceRef: recapId,
          dueDate: task.dueDate ? new Date(task.dueDate) : null,
          client,
          deliverTo: task.deliverTo || "internal",
        },
      });
      created++;
    }

    return created;
  } catch (err) {
    await log("ia-recap", "Erro ao processar Meet Recap com IA", {
      level: "error",
      detail: String(err),
    });
    console.error("[process-recap] erro:", err);
    return 0;
  }
}
