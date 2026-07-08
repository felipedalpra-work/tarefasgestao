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

const events = await prisma.calendarEvent.findMany({ orderBy: { startAt: "asc" } });
console.log(`${events.length} evento(s) no calendário:\n`);
for (const e of events) {
  console.log(`  ${e.startAt.toLocaleDateString("pt-BR")} ${e.startAt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })} | ${e.title} | client: ${e.client}`);
}

if (events.length === 0) {
  console.log("Nenhum evento. Criando eventos de exemplo para teste...\n");
  const today = new Date();
  const examples = [
    { client: "Fismatek", daysFromNow: 2, time: 10 },
    { client: "Fismatek", daysFromNow: 9, time: 10 },
    { client: "Bairral", daysFromNow: 4, time: 14 },
    { client: "Bairral", daysFromNow: 11, time: 14 },
    { client: "Amora", daysFromNow: 7, time: 15 },
  ];
  for (const ex of examples) {
    const startAt = new Date(today);
    startAt.setDate(today.getDate() + ex.daysFromNow);
    startAt.setHours(ex.time, 0, 0, 0);
    const endAt = new Date(startAt);
    endAt.setHours(ex.time + 1);
    await prisma.calendarEvent.create({
      data: {
        googleId: `mock-${ex.client}-${ex.daysFromNow}`,
        title: `O2 Inc & ${ex.client} | Weekly`,
        client: ex.client,
        startAt,
        endAt,
      },
    });
    console.log(`  Criado: O2 Inc & ${ex.client} em ${startAt.toLocaleDateString("pt-BR")} ${ex.time}h`);
  }
}

await prisma.$disconnect();
