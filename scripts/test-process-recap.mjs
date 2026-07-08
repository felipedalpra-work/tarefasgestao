import { PrismaNeon } from "@prisma/adapter-neon";
import { neonConfig } from "@neondatabase/serverless";
import { PrismaClient } from "@prisma/client";
import ws from "ws";
import path from "path";
import { fileURLToPath } from "url";
import Groq from "groq-sdk";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../.env") });

neonConfig.webSocketConstructor = ws;
const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// pega o primeiro recap não processado com conteúdo
const recap = await prisma.meetRecap.findFirst({
  where: { processedAt: null },
  orderBy: { createdAt: "desc" },
});

if (!recap) {
  // todos processados — reseta o mais recente
  const latest = await prisma.meetRecap.findFirst({ orderBy: { createdAt: "desc" } });
  if (latest) {
    await prisma.meetRecap.update({
      where: { id: latest.id },
      data: { processedAt: null, suggestedTasks: null },
    });
    console.log(`Reset recap: ${latest.id} "${latest.subject}"`);
  }
  await prisma.$disconnect();
  process.exit(0);
}

console.log(`\nProcessando: "${recap.subject}" (${recap.body?.length || 0} chars)`);
console.log(`ID: ${recap.id}`);
console.log(`Body: ${recap.body?.slice(0, 200)}\n`);

if (!recap.body || recap.body.trim().length < 20) {
  console.log("Body muito curto ou nulo — marcando como processado vazio");
  await prisma.$disconnect();
  process.exit(0);
}

const users = await prisma.user.findMany({ select: { id: true, name: true, email: true } });
const memberList = users.map((u) => u.name || u.email).join(", ");
const today = new Date().toISOString().split("T")[0];

console.log(`Membros: ${memberList}`);
console.log(`Hoje: ${today}\n`);

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

Retorne APENAS JSON válido:
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

const completion = await groq.chat.completions.create({
  model: "llama-3.3-70b-versatile",
  messages: [{ role: "user", content: prompt }],
  temperature: 0.1,
  max_tokens: 2048,
});

const text = completion.choices[0]?.message?.content || "{}";
console.log("=== GROQ RESPONSE ===");
console.log(text);
console.log("=====================\n");

const jsonMatch = text.match(/\{[\s\S]*\}/);
if (!jsonMatch) {
  console.log("❌ Nenhum JSON encontrado!");
  await prisma.$disconnect();
  process.exit(1);
}

const result = JSON.parse(jsonMatch[0]);
console.log(`✓ Client: ${result.client}`);
console.log(`✓ Tasks: ${result.tasks?.length || 0}`);
(result.tasks || []).forEach(t => {
  console.log(`  → "${t.title}" | assignee="${t.assignee}" | deliverTo="${t.deliverTo}"`);
});

// salva no DB
let created = 0;
for (const task of (result.tasks || [])) {
  if (!task.title?.trim()) continue;
  let assigneeId = null;
  if (task.assignee?.trim()) {
    const nameLower = task.assignee.toLowerCase().trim();
    const match = users.find((u) => {
      const userName = (u.name || "").toLowerCase();
      const userFirstName = userName.split(" ")[0];
      return userName.includes(nameLower) || nameLower.includes(userName) ||
             nameLower.includes(userFirstName) || userFirstName.includes(nameLower) ||
             u.email.toLowerCase().includes(nameLower);
    });
    if (match) {
      assigneeId = match.id;
      console.log(`  ✓ Match: "${task.assignee}" → ${match.name}`);
    } else {
      console.log(`  ✗ Sem match para: "${task.assignee}"`);
    }
  }
  await prisma.task.create({
    data: {
      title: task.title.slice(0, 255),
      description: task.description || null,
      priority: ["high","medium","low"].includes(task.priority) ? task.priority : "medium",
      status: "todo",
      assigneeId,
      createdById: users[0].id,
      source: "meet_recap",
      sourceRef: recap.id,
      dueDate: task.dueDate ? new Date(task.dueDate) : null,
      client: result.client || null,
      deliverTo: task.deliverTo || "internal",
    },
  });
  created++;
}

await prisma.meetRecap.update({
  where: { id: recap.id },
  data: { suggestedTasks: JSON.stringify(result.tasks || []), processedAt: new Date(), client: result.client || null },
});

console.log(`\n✓ ${created} tarefa(s) criada(s)`);
await prisma.$disconnect();
