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

const recaps = await prisma.meetRecap.findMany({
  orderBy: { createdAt: "desc" },
  take: 5,
});

const users = await prisma.user.findMany({ select: { id: true, name: true, email: true } });
const memberList = users.map((u) => u.name || u.email).join(", ");
const today = new Date().toISOString().split("T")[0];

for (const recap of recaps) {
  if (!recap.body || recap.body.trim().length < 20) {
    console.log(`\n--- SKIP: "${recap.subject}" (body muito curto) ---\n`);
    continue;
  }

  console.log(`\n${"=".repeat(70)}`);
  console.log(`RECAP: "${recap.subject}" (${recap.body.length} chars)`);
  console.log(`BODY preview: ${recap.body.slice(0, 200).replace(/\n/g, " ")}`);
  console.log("=".repeat(70));

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

  try {
    const completion = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.1,
      max_tokens: 2048,
    });

    const text = completion.choices[0]?.message?.content || "";
    console.log("\n[GROQ RESPOSTA BRUTA]:");
    console.log(text);
    console.log("\n[REGEX TEST]:");
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.log("❌ regex não encontrou JSON!");
      const arrayMatch = text.match(/\[[\s\S]*\]/);
      console.log(arrayMatch ? "✓ mas encontrou array" : "❌ nem array");
    } else {
      console.log("✓ regex encontrou JSON");
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        console.log(`✓ JSON válido | client="${parsed.client}" | tasks=${parsed.tasks?.length ?? 0}`);
        if (parsed.tasks?.length > 0) {
          parsed.tasks.forEach(t => console.log(`  → "${t.title}" | assignee="${t.assignee}"`));
        }
      } catch (e) {
        console.log("❌ JSON.parse falhou:", e.message);
        console.log("matched string:", jsonMatch[0].slice(0, 200));
      }
    }
  } catch (err) {
    console.error("❌ Groq API error:", err.message);
  }
}

await prisma.$disconnect();
