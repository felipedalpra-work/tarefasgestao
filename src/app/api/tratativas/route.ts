import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { auth } from "@/lib/auth";
import { forSquad } from "@/lib/tenant-prisma";

const TIPO_VALUES = ["preventiva", "reativa"];

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const db = forSquad(session.user.squadId);

  const tratativas = await db.tratativa.findMany({
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
  const db = forSquad(session.user.squadId);

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

  const tratativa = await db.tratativa.create({
    data: {
      squadId: session.user.squadId,
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
