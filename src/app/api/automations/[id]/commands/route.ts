import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isAdmin } from "@/lib/authz";
import { forSquad } from "@/lib/tenant-prisma";
import { log } from "@/lib/logger";

type Params = { params: Promise<{ id: string }> };

// Criado a partir do painel /automacoes: "Rodar agora", "Pausar" ou "Reativar".
// Pausar/Reativar já refletem na hora (enabled muda no banco e some/volta da
// listagem como "pausada"); a tarefa fica na fila (AutomationCommand) pra uma
// tarefa agendada do Claude (bridge de comandos) buscar, aplicar o efeito real
// no agendador do lado dela (ex: desabilitar o cron), e marcar como concluída.
// Controle operacional de squad (mesmo nível de Slack/n8n/Meet Recap) — admin-only.
export async function POST(req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdmin(session)) return NextResponse.json({ error: "Só admin do squad pode controlar automações" }, { status: 403 });
  const db = forSquad(session.user.squadId);

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const type = body?.type;
  if (type !== "trigger" && type !== "pause" && type !== "resume") {
    return NextResponse.json({ error: 'type deve ser "trigger", "pause" ou "resume"' }, { status: 400 });
  }

  const automation = await db.automation.findUnique({ where: { id } });
  if (!automation) return NextResponse.json({ error: "Automação não encontrada" }, { status: 404 });

  if (type === "pause" || type === "resume") {
    await db.automation.update({ where: { id }, data: { enabled: type === "resume" } });
  }

  const command = await db.automationCommand.create({
    data: {
      automationId: id,
      type,
      requestedById: session.user.email ?? session.user.name ?? null,
    },
  });

  await log("automations", `${automation.name}: comando "${type}" solicitado por ${session.user.email ?? session.user.name ?? "alguém"}`);

  return NextResponse.json(command, { status: 201 });
}
