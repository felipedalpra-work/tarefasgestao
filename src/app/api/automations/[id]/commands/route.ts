import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { log } from "@/lib/logger";

type Params = { params: Promise<{ id: string }> };

// Criado a partir do painel /automacoes: "Rodar agora", "Pausar" ou "Reativar".
// Pausar/Reativar já refletem na hora (enabled muda no banco e some/volta da
// listagem como "pausada"); a tarefa fica na fila (AutomationCommand) pra uma
// tarefa agendada do Claude (bridge de comandos) buscar, aplicar o efeito real
// no agendador do lado dela (ex: desabilitar o cron), e marcar como concluída.
export async function POST(req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const type = body?.type;
  if (type !== "trigger" && type !== "pause" && type !== "resume") {
    return NextResponse.json({ error: 'type deve ser "trigger", "pause" ou "resume"' }, { status: 400 });
  }

  const automation = await prisma.automation.findUnique({ where: { id } });
  if (!automation) return NextResponse.json({ error: "Automação não encontrada" }, { status: 404 });

  if (type === "pause" || type === "resume") {
    await prisma.automation.update({ where: { id }, data: { enabled: type === "resume" } });
  }

  const command = await prisma.automationCommand.create({
    data: {
      automationId: id,
      type,
      requestedById: session.user.email ?? session.user.name ?? null,
    },
  });

  await log("automations", `${automation.name}: comando "${type}" solicitado por ${session.user.email ?? session.user.name ?? "alguém"}`);

  return NextResponse.json(command, { status: 201 });
}
