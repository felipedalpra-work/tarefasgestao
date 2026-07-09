import { PrismaNeon } from "@prisma/adapter-neon";
import { neonConfig } from "@neondatabase/serverless";
import { PrismaClient } from "@prisma/client";
import ws from "ws";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../.env") });

neonConfig.webSocketConstructor = ws;
const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

// deleta as sugestões (senão ficam com taskId apontando pra uma task apagada)
const deletedSuggestions = await prisma.recapSuggestion.deleteMany({});
console.log(`${deletedSuggestions.count} sugestão(ões) deletada(s)`);

// deleta tarefas criadas por meet_recap
const deleted = await prisma.task.deleteMany({ where: { source: "meet_recap" } });
console.log(`${deleted.count} tarefa(s) de meet_recap deletada(s)`);

// reseta os recaps para reprocessar
const reset = await prisma.meetRecap.updateMany({
  data: { processedAt: null, suggestedTasks: null, client: null },
});
console.log(`${reset.count} recap(s) resetado(s) para reprocessamento`);

await prisma.$disconnect();
