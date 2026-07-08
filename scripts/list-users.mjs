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

const users = await prisma.user.findMany({ orderBy: { createdAt: "asc" } });
console.log(`${users.length} usuário(s):\n`);
for (const u of users) {
  console.log(`  ${u.id} | ${u.email} | ${u.name} | createdAt: ${u.createdAt}`);
}

await prisma.$disconnect();
