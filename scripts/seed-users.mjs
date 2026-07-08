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

const users = [
  { name: "Felipe", email: "felipe.dalpra@o2inc.com.br", password: "o2squad2024" },
  { name: "Gustavo", email: "gustavo.cochlar@o2inc.com.br", password: "o2squad2024" },
  { name: "Humberto", email: "humberto.behs@o2inc.com.br", password: "o2squad2024" },
];

for (const u of users) {
  const hash = await bcrypt.hash(u.password, 10);
  await prisma.user.upsert({
    where: { email: u.email },
    update: { name: u.name, password: hash },
    create: { name: u.name, email: u.email, password: hash },
  });
  console.log(`✓ ${u.name} (${u.email})`);
}

console.log("\nSenha inicial de todos: o2squad2024");
console.log("Troque depois de logar!");

await prisma.$disconnect();
