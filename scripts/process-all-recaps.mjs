import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "@prisma/client";
import path from "path";
import { fileURLToPath } from "url";
import Groq from "groq-sdk";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../.env") });

const adapter = new PrismaBetterSqlite3({ url: path.resolve(__dirname, "../dev.db") });
const prisma = new PrismaClient({ adapter });
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const users = await prisma.user.findMany({ select: { id: true, name: true, email: true } });
const memberList = users.map((u) => u.name || u.email).join(", ");
const today = new Date().toISOString().split("T")[0];

console.log(`Membros: ${memberList}`);
console.log(`Hoje: ${today}\n`);

const recaps = await prisma.meetRecap.findMany({
  where: { processedAt: null },
  orderBy: { createdAt: "asc" },
});
console.log(`${recaps.length} recap(s) para processar\n`);

let totalTasks = 0;

for (const recap of recaps) {
  console.log(`--- "${recap.subject}" (${recap.body?.length || 0} chars) ---`);

  if (!recap.body || recap.body.trim().length < 20) {
    await prisma.meetRecap.update({
      where: { id: recap.id },
      data: { suggestedTasks: "[]", processedAt: new Date() },
    });
    console.log("  → corpo vazio, pulando\n");
    continue;
  }

  const prompt = `Você é um assistente de gestão de tarefas para a empresa O2 Inc. Analise o conteúdo abaixo (transcrição, resumo ou lista de próximas etapas de reunião) e extraia TODAS as tarefas e compromissos.

Membros do squad O2: ${memberList}

Conteúdo:
${recap.body.slice(0, 5000)}

Instruções:
- Identifique o nome do cliente da reunião se mencionado (ex: "Fismatek", "Zé do Flor")
- Para cada tarefa identifique quem deve entregar: "client" se é o cliente que entrega para a O2, "o2" se é a O2 que entrega para o cliente, "internal" se é tarefa interna
- "assignee": APENAS se o nome de um destes membros for explicitamente mencionado como responsável: ${memberList}. Se não for mencionado explicitamente, use string vazia "". NUNCA invente um responsável.
- Prazos: converta para YYYY-MM-DD considerando hoje = ${today}
- priority: "high" se urgente, "medium" como padrão, "low" sem urgência

Retorne APENAS JSON válido sem markdown:
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
    const completion = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.1,
      max_tokens: 2048,
    });

    const raw = completion.choices[0]?.message?.content || "{}";
    // strip markdown code blocks
    const text = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.log("  → sem JSON na resposta, pulando");
      await prisma.meetRecap.update({
        where: { id: recap.id },
        data: { suggestedTasks: "[]", processedAt: new Date() },
      });
      continue;
    }

    const result = JSON.parse(jsonMatch[0]);
    const tasks = result.tasks || [];
    const client = result.client || null;

    console.log(`  client: ${client} | ${tasks.length} tarefa(s)`);

    await prisma.meetRecap.update({
      where: { id: recap.id },
      data: { suggestedTasks: JSON.stringify(tasks), processedAt: new Date(), client },
    });

    let created = 0;
    for (const task of tasks) {
      if (!task.title?.trim()) continue;

      let assigneeId = null;
      if (task.assignee?.trim()) {
        const nameLower = task.assignee.toLowerCase().trim();
        const match = users.find((u) => {
          const userName = (u.name || "").toLowerCase();
          const userFirstName = userName.split(" ")[0];
          return (
            userName.includes(nameLower) ||
            nameLower.includes(userName) ||
            nameLower.includes(userFirstName) ||
            userFirstName.includes(nameLower) ||
            u.email.toLowerCase().includes(nameLower) ||
            nameLower.includes(u.email.split("@")[0].toLowerCase())
          );
        });
        if (match) {
          assigneeId = match.id;
          console.log(`    ✓ "${task.title}" → ${match.name}`);
        } else {
          console.log(`    ✗ "${task.title}" → sem match para "${task.assignee}"`);
        }
      } else {
        console.log(`    ? "${task.title}" → sem responsável`);
      }

      await prisma.task.create({
        data: {
          title: task.title.slice(0, 255),
          description: task.description || null,
          priority: ["high", "medium", "low"].includes(task.priority) ? task.priority : "medium",
          status: "todo",
          assigneeId,
          createdById: users[0].id,
          source: "meet_recap",
          sourceRef: recap.id,
          dueDate: task.dueDate ? new Date(task.dueDate) : null,
          client,
          deliverTo: task.deliverTo || "internal",
        },
      });
      created++;
      totalTasks++;
    }
    console.log(`  → ${created} criada(s)\n`);
  } catch (err) {
    console.error(`  ❌ Erro: ${err.message}\n`);
    await prisma.meetRecap.update({
      where: { id: recap.id },
      data: { suggestedTasks: "[]", processedAt: new Date() },
    });
  }
}

console.log(`\n✓ TOTAL: ${totalTasks} tarefa(s) criada(s)`);
await prisma.$disconnect();
