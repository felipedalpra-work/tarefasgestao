import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const TIPO_VALUES = ["preventiva", "reativa"];

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const tratativas = await prisma.tratativa.findMany({
    include: {
      responsavel: { select: { id: true, name: true, image: true } },
      createdBy: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(tratativas);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();

  if (!body.client || typeof body.client !== "string") {
    return NextResponse.json({ error: "client é obrigatório" }, { status: 400 });
  }
  if (!TIPO_VALUES.includes(body.tipo)) {
    return NextResponse.json({ error: "tipo inválido (preventiva|reativa)" }, { status: 400 });
  }
  if (!body.motivo || typeof body.motivo !== "string") {
    return NextResponse.json({ error: "motivo é obrigatório" }, { status: 400 });
  }

  const tratativa = await prisma.tratativa.create({
    data: {
      client: body.client,
      tipo: body.tipo,
      motivo: body.motivo,
      descricao: body.descricao || null,
      satisfacao: body.satisfacao || null,
      problemaNaOxy: !!body.problemaNaOxy,
      responsavelId: body.responsavelId || null,
      dataPrevistaFinalizacao: body.dataPrevistaFinalizacao ? new Date(body.dataPrevistaFinalizacao) : null,
      createdById: session.user.id,
    },
    include: {
      responsavel: { select: { id: true, name: true, image: true } },
      createdBy: { select: { id: true, name: true } },
    },
  });

  revalidateTag("tratativas", "max");

  return NextResponse.json(tratativa, { status: 201 });
}
