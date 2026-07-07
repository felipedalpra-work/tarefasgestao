import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "@prisma/client";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const adapter = new PrismaBetterSqlite3({ url: path.resolve(__dirname, "../dev.db") });
const prisma = new PrismaClient({ adapter });

// deleta tarefas criadas por meet_recap
const deleted = await prisma.task.deleteMany({ where: { source: "meet_recap" } });
console.log(`${deleted.count} tarefa(s) de meet_recap deletada(s)`);

// reseta os recaps para reprocessar
const reset = await prisma.meetRecap.updateMany({
  data: { processedAt: null, suggestedTasks: null, client: null },
});
console.log(`${reset.count} recap(s) resetado(s) para reprocessamento`);

await prisma.$disconnect();
