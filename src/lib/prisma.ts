import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

// Driver adapter Postgres padrão (Supabase, via pooler em modo transaction) — Prisma 7
// exige adapter sempre, não aceita mais `url` direto no datasource. Migrado do Neon em
// 2026-09-21 depois do projeto Neon ficar bloqueado por limite de plano sem
// possibilidade de upgrade imediato.
const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

function createPrisma() {
  // max baixo de propósito: a VPS nova (sem pooler tipo PgBouncer na frente) tem limite
  // de conexões apertado pro role apps_dev, e cada invocação serverless da Vercel abre
  // seu próprio pool — sem isso, poucas invocações concorrentes já estouram o limite
  // ("too many connections for role apps_dev").
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL, max: 1 });
  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma || createPrisma();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
