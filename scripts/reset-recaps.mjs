import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "@prisma/client";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const adapter = new PrismaBetterSqlite3({ url: path.resolve(__dirname, "../dev.db") });
const prisma = new PrismaClient({ adapter });

const deleted = await prisma.meetRecap.deleteMany({});
console.log(`${deleted.count} recap(s) deletado(s). Sincronize novamente no sistema.`);

await prisma.$disconnect();
