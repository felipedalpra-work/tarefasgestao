import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ name: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { name } = await params;
  const client = decodeURIComponent(name);
  const fechamentos = await prisma.fechamentoMensal.findMany({
    where: { client },
    orderBy: [{ year: "desc" }, { month: "desc" }],
  });

  return NextResponse.json(fechamentos);
}

const BOOLEAN_FIELDS = ["comiteRealizado", "rebalanceamentoFeito", "conciliacaoOk", "cpCrFechados"] as const;
const FREE_TEXT_FIELDS = ["pendenciasAnotadas", "maturidade"] as const;

export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { name } = await params;
  const client = decodeURIComponent(name);
  const body = await req.json();

  const year = Number(body.year);
  const month = Number(body.month);
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    return NextResponse.json({ error: "year/month inválidos" }, { status: 400 });
  }

  const data: Record<string, string | boolean | Date | null> = {};
  for (const field of BOOLEAN_FIELDS) {
    if (body[field] !== undefined) data[field] = !!body[field];
  }
  for (const field of FREE_TEXT_FIELDS) {
    if (body[field] !== undefined) data[field] = body[field] || null;
  }
  if (body.healthReviewedAt !== undefined) {
    data.healthReviewedAt = body.healthReviewedAt ? new Date(body.healthReviewedAt) : null;
  }

  const fechamento = await prisma.fechamentoMensal.upsert({
    where: { client_year_month: { client, year, month } },
    update: data,
    create: { client, year, month, ...data },
  });

  revalidateTag("clients", "max");

  return NextResponse.json(fechamento);
}
