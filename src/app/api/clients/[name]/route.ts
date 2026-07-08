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
  const note = await prisma.clientNote.findUnique({ where: { client } });
  return NextResponse.json(note ?? { client, notes: null, contacts: null });
}

export async function PUT(req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { name } = await params;
  const client = decodeURIComponent(name);
  const body = await req.json();

  const note = await prisma.clientNote.upsert({
    where: { client },
    update: { notes: body.notes ?? null, contacts: body.contacts ?? null },
    create: { client, notes: body.notes ?? null, contacts: body.contacts ?? null },
  });

  return NextResponse.json(note);
}

const STATUS_VALUES = ["ativo", "pausado", "encerrado"];
const OXY_STAGE_VALUES = ["nao_iniciado", "em_implantacao", "ativo", "com_pendencia"];
const IMPORT_TYPE_VALUES = ["manual", "automatica"];

// Atualização parcial da situação geral / situação na Oxy (usado pela tabela de clientes)
export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { name } = await params;
  const client = decodeURIComponent(name);
  const body = await req.json();

  const data: {
    status?: string;
    oxyStage?: string;
    importType?: string | null;
    lastDataUpdate?: Date | null;
    oxyPendencies?: string | null;
  } = {};

  if (body.status !== undefined) {
    if (!STATUS_VALUES.includes(body.status)) return NextResponse.json({ error: "status inválido" }, { status: 400 });
    data.status = body.status;
  }
  if (body.oxyStage !== undefined) {
    if (!OXY_STAGE_VALUES.includes(body.oxyStage)) return NextResponse.json({ error: "oxyStage inválido" }, { status: 400 });
    data.oxyStage = body.oxyStage;
  }
  if (body.importType !== undefined) {
    if (body.importType !== null && !IMPORT_TYPE_VALUES.includes(body.importType)) {
      return NextResponse.json({ error: "importType inválido" }, { status: 400 });
    }
    data.importType = body.importType;
  }
  if (body.lastDataUpdate !== undefined) {
    data.lastDataUpdate = body.lastDataUpdate ? new Date(body.lastDataUpdate) : null;
  }
  if (body.oxyPendencies !== undefined) {
    data.oxyPendencies = body.oxyPendencies || null;
  }

  const note = await prisma.clientNote.upsert({
    where: { client },
    update: data,
    create: { client, status: "ativo", oxyStage: "nao_iniciado", ...data },
  });

  revalidateTag("clients", "max");

  return NextResponse.json(note);
}
