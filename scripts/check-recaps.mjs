import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "@prisma/client";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const adapter = new PrismaBetterSqlite3({ url: path.resolve(__dirname, "../dev.db") });
const prisma = new PrismaClient({ adapter });

const recaps = await prisma.meetRecap.findMany({ orderBy: { createdAt: "desc" } });
console.log(`Total: ${recaps.length} recap(s)\n`);
for (const r of recaps) {
  console.log(`"${r.subject.slice(0, 60)}"`);
  console.log(`  corpo: ${r.body?.length || 0} chars | processado: ${!!r.processedAt}`);
  if (r.body?.length > 0) console.log(`  preview: ${r.body.slice(0, 100).replace(/\n/g, " ")}`);
  console.log("");
}

await prisma.$disconnect();
