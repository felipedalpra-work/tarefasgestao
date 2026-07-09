import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

const STATUS_VALUES = ["triagem", "em_tratativa", "plano_de_acao", "concluida"];
const TIPO_VALUES = ["preventiva", "reativa"];
const DESFECHO_VALUES = ["recuperado", "churn", "downsell", "mudanca_escopo", "desistencia"];
const FREE_TEXT_FIELDS = ["motivo", "descricao", "satisfacao", "planoDeAcao", "churnMotivo"] as const;
const DATE_FIELDS = ["dataPrevistaFinalizacao", "churnData"] as const;

export async function GET(_req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const tratativa = await prisma.tratativa.findUnique({
    where: { id },
    include: {
      responsavel: { select: { id: true, name: true, image: true } },
      createdBy: { select: { id: true, name: true } },
    },
  });
  if (!tratativa) return NextResponse.json({ error: "Não encontrada" }, { status: 404 });
  return NextResponse.json(tratativa);
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();

  const data: Record<string, string | Date | boolean | null> = {};

  if (body.tipo !== undefined) {
    if (!TIPO_VALUES.includes(body.tipo)) return NextResponse.json({ error: "tipo inválido" }, { status: 400 });
    data.tipo = body.tipo;
  }
  if (body.status !== undefined) {
    if (!STATUS_VALUES.includes(body.status)) return NextResponse.json({ error: "status inválido" }, { status: 400 });
    data.status = body.status;
  }
  if (body.desfecho !== undefined) {
    if (body.desfecho !== null && !DESFECHO_VALUES.includes(body.desfecho)) {
      return NextResponse.json({ error: "desfecho inválido" }, { status: 400 });
    }
    data.desfecho = body.desfecho;
  }
  if (body.problemaNaOxy !== undefined) data.problemaNaOxy = !!body.problemaNaOxy;
  if (body.responsavelId !== undefined) data.responsavelId = body.responsavelId || null;
  for (const field of FREE_TEXT_FIELDS) {
    if (body[field] !== undefined) data[field] = body[field] || null;
  }
  for (const field of DATE_FIELDS) {
    if (body[field] !== undefined) data[field] = body[field] ? new Date(body[field]) : null;
  }

  const tratativa = await prisma.tratativa.update({
    where: { id },
    data,
    include: {
      responsavel: { select: { id: true, name: true, image: true } },
      createdBy: { select: { id: true, name: true } },
    },
  });

  revalidateTag("tratativas", "max");

  return NextResponse.json(tratativa);
}
