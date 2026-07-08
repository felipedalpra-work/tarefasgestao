import { PrismaNeon } from "@prisma/adapter-neon";
import { neonConfig } from "@neondatabase/serverless";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import ws from "ws";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../.env") });

neonConfig.webSocketConstructor = ws;
const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const user = await prisma.user.findUnique({ where: { email: "felipe.dalpra@o2inc.com.br" } });
console.log("Usuário encontrado:", user?.email);
console.log("Tem senha:", !!user?.password);
if (user?.password) {
  const ok = await bcrypt.compare("o2squad2024", user.password);
  console.log("Senha correta:", ok);
}
await prisma.$disconnect();
