import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "@prisma/client";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const adapter = new PrismaBetterSqlite3({ url: path.resolve(__dirname, "../dev.db") });
const prisma = new PrismaClient({ adapter });

const tasks = await prisma.task.findMany({
  include: { assignee: { select: { name: true } }, createdBy: { select: { name: true } } },
  orderBy: { createdAt: "desc" },
});
console.log(`Total: ${tasks.length} tarefa(s)\n`);

const byAssignee = {};
for (const t of tasks) {
  const name = t.assignee?.name || "(sem responsável)";
  byAssignee[name] = (byAssignee[name] || 0) + 1;
}
console.log("Por responsável:");
for (const [name, count] of Object.entries(byAssignee)) {
  console.log(`  ${name}: ${count}`);
}

console.log("\nÚltimas 5:");
for (const t of tasks.slice(0, 5)) {
  console.log(`  "${t.title}" → ${t.assignee?.name || "—"} | client: ${t.client || "—"} | ${t.status}`);
}

await prisma.$disconnect();
