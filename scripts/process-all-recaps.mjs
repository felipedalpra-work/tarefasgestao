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

let totalSuggestions = 0;

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

    console.log(`  client: ${client} | ${tasks.length} sugestão(ões)`);

    await prisma.meetRecap.update({
      where: { id: recap.id },
      data: { suggestedTasks: JSON.stringify(tasks), processedAt: new Date(), client },
    });

    // NUNCA cria Task aqui — só grava a sugestão. A tarefa só nasce quando
    // alguém clica "Adicionar" na tela de Recaps (evita duplicação).
    const validTasks = tasks.filter((t) => t.title?.trim());
    if (validTasks.length > 0) {
      await prisma.recapSuggestion.createMany({
        data: validTasks.map((t, index) => ({
          recapId: recap.id,
          index,
          title: t.title.slice(0, 255),
          description: t.description || null,
          assignee: t.assignee || null,
          priority: ["high", "medium", "low"].includes(t.priority) ? t.priority : "medium",
          dueDate: t.dueDate ? new Date(t.dueDate) : null,
        })),
      });
    }
    totalSuggestions += validTasks.length;
    console.log(`  → ${validTasks.length} sugestão(ões) gravada(s)\n`);
  } catch (err) {
    console.error(`  ❌ Erro: ${err.message}\n`);
    await prisma.meetRecap.update({
      where: { id: recap.id },
      data: { suggestedTasks: "[]", processedAt: new Date() },
    });
  }
}

console.log(`\n✓ TOTAL: ${totalSuggestions} sugestão(ões) de tarefa gravada(s) — revise em /recaps antes de adicionar ao Kanban`);
await prisma.$disconnect();
