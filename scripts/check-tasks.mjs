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
