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
