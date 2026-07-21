import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ensureOnboardingDeliverables } from "@/lib/onboarding-deliverables";

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
      healthStatus: "verde",
      onboardingStartAt: null,
      cfoAllocatedAt: null,
      kickoffScheduledAt: null,
      kickoffDoneAt: null,
      setupDoneAt: null,
      diagnosticDoneAt: null,
      oxyIntegratedAt: null,
      diagnosticoHandoffAt: null,
      diagnosticoIntakeAt: null,
      diagnosticoIntakePendente: null,
      diagnosticoAnaliseAt: null,
      diagnosticoValidacaoAt: null,
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
const HEALTH_STATUS_VALUES = ["verde", "amarelo", "vermelho"];
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
  "diagnosticoIntakePendente",
] as const;
const DATE_FIELDS = [
  "onboardingStartAt",
  "cfoAllocatedAt",
  "kickoffScheduledAt",
  "kickoffDoneAt",
  "setupDoneAt",
  "diagnosticDoneAt",
  "oxyIntegratedAt",
  "diagnosticoHandoffAt",
  "diagnosticoIntakeAt",
  "diagnosticoAnaliseAt",
  "diagnosticoValidacaoAt",
] as const;

// Atualização parcial da situação geral / situação na Oxy (usado pela tabela e pela aba Oxy do cliente)
export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

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
  if (body.healthStatus !== undefined) {
    if (!HEALTH_STATUS_VALUES.includes(body.healthStatus)) {
      return NextResponse.json({ error: "healthStatus inválido" }, { status: 400 });
    }
    data.healthStatus = body.healthStatus;
  }
  for (const field of FREE_TEXT_FIELDS) {
    if (body[field] !== undefined) data[field] = body[field] || null;
  }
  for (const field of DATE_FIELDS) {
    if (body[field] !== undefined) data[field] = body[field] ? new Date(body[field]) : null;
  }

  const note = await prisma.clientNote.upsert({
    where: { client },
    update: data,
    create: { client, status: "ativo", oxyStage: "nao_iniciado", ...data },
  });

  if (data.onboardingStartAt instanceof Date) {
    await ensureOnboardingDeliverables(client, data.onboardingStartAt, session.user.id);
    revalidateTag("tasks", "max");
  }

  revalidateTag("clients", "max");

  return NextResponse.json(note);
}

// Exclui o cliente e tudo que aponta pro nome dele (client não é entidade própria,
// é string espalhada em Task/CalendarEvent/MeetRecap/Tratativa/SetupMeeting/FechamentoMensal).
// Ação destrutiva e irreversível — a confirmação fica a cargo da UI.
export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { name } = await params;
  const client = decodeURIComponent(name);

  await prisma.$transaction([
    prisma.meetRecap.deleteMany({ where: { client } }), // cascade apaga RecapSuggestion junto
    prisma.externalSuggestion.deleteMany({ where: { client } }),
    prisma.task.deleteMany({ where: { client } }), // cascade apaga Subtask/TaskActivity/TaskLink/TaskComment junto
    prisma.calendarEvent.deleteMany({ where: { client } }),
    prisma.tratativa.deleteMany({ where: { client } }),
    prisma.setupMeeting.deleteMany({ where: { client } }),
    prisma.fechamentoMensal.deleteMany({ where: { client } }),
    prisma.clientNote.deleteMany({ where: { client } }),
  ]);

  revalidateTag("clients", "max");
  revalidateTag("calendar", "max");
  revalidateTag("recaps", "max");
  revalidateTag("tasks", "max");
  revalidateTag("tratativas", "max");

  return NextResponse.json({ ok: true });
}
