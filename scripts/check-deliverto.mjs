import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "@prisma/client";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const adapter = new PrismaBetterSqlite3({ url: path.resolve(__dirname, "../dev.db") });
const prisma = new PrismaClient({ adapter });

const groups = await prisma.task.groupBy({
  by: ["client", "deliverTo"],
  _count: true,
  orderBy: [{ client: "asc" }, { deliverTo: "asc" }],
});
console.log("client | deliverTo | count");
for (const g of groups) {
  console.log(`  ${g.client ?? "(null)"} | ${g.deliverTo ?? "(null)"} | ${g._count}`);
}

await prisma.$disconnect();
