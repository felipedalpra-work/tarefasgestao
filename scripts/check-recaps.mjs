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

const recaps = await prisma.meetRecap.findMany({ orderBy: { createdAt: "desc" } });
console.log(`Total: ${recaps.length} recap(s)\n`);
for (const r of recaps) {
  console.log(`"${r.subject.slice(0, 60)}"`);
  console.log(`  corpo: ${r.body?.length || 0} chars | processado: ${!!r.processedAt}`);
  if (r.body?.length > 0) console.log(`  preview: ${r.body.slice(0, 100).replace(/\n/g, " ")}`);
  console.log("");
}

await prisma.$disconnect();
