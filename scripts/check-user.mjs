import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const adapter = new PrismaBetterSqlite3({ url: path.resolve(__dirname, "../dev.db") });
const prisma = new PrismaClient({ adapter });

const user = await prisma.user.findUnique({ where: { email: "felipe.dalpra@o2inc.com.br" } });
console.log("Usuário encontrado:", user?.email);
console.log("Tem senha:", !!user?.password);
if (user?.password) {
  const ok = await bcrypt.compare("o2squad2024", user.password);
  console.log("Senha correta:", ok);
}
await prisma.$disconnect();
