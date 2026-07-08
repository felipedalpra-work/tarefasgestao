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
  return NextResponse.json(
    note ?? {
      client,
      notes: null,
      contacts: null,
      status: "ativo",
      oxyStage: "nao_iniciado",
      importType: null,
      lastDataUpdate: null,
      oxyPendencies: null,
      pendencyWho: null,
      erp: null,
      accessMode: null,
      updateFrequency: null,
      updateResponsible: null,
      routineWhat: null,
      routineWho: null,
      routineWhen: null,
    }
  );
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
const OXY_STAGE_VALUES = ["nao_iniciado", "em_validacao", "em_implantacao", "implantacao_interrompida", "ativo"];
const IMPORT_TYPE_VALUES = ["manual", "automatica", "automatica_manual"];
const FREE_TEXT_FIELDS = [
  "oxyPendencies",
  "pendencyWho",
  "erp",
  "accessMode",
  "updateFrequency",
  "updateResponsible",
  "routineWhat",
  "routineWho",
  "routineWhen",
] as const;

// Atualização parcial da situação geral / situação na Oxy (usado pela tabela e pela aba Oxy do cliente)
export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { name } = await params;
  const client = decodeURIComponent(name);
  const body = await req.json();

  const data: Record<string, string | Date | null> = {};

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
  for (const field of FREE_TEXT_FIELDS) {
    if (body[field] !== undefined) data[field] = body[field] || null;
  }

  const note = await prisma.clientNote.upsert({
    where: { client },
    update: data,
    create: { client, status: "ativo", oxyStage: "nao_iniciado", ...data },
  });

  revalidateTag("clients", "max");

  return NextResponse.json(note);
}
