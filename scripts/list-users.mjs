import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "@prisma/client";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const adapter = new PrismaBetterSqlite3({ url: path.resolve(__dirname, "../dev.db") });
const prisma = new PrismaClient({ adapter });

const users = await prisma.user.findMany({ orderBy: { createdAt: "asc" } });
console.log(`${users.length} usuário(s):\n`);
for (const u of users) {
  console.log(`  ${u.id} | ${u.email} | ${u.name} | createdAt: ${u.createdAt}`);
}

await prisma.$disconnect();
