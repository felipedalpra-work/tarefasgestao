import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ensureKnownAutomations } from "@/lib/automations";

// Lista as automações pro painel /automacoes: status atual + se há algum
// comando ainda pendente (ex: "Rodar agora" clicado, esperando a bridge
// do Claude processar).
export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await ensureKnownAutomations();

  const automations = await prisma.automation.findMany({
    orderBy: { name: "asc" },
    include: {
      commands: {
        where: { status: "pending" },
        orderBy: { requestedAt: "desc" },
        take: 1,
      },
    },
  });

  return NextResponse.json(
    automations.map((a) => ({
      id: a.id,
      key: a.key,
      name: a.name,
      client: a.client,
      scheduleLabel: a.scheduleLabel,
      enabled: a.enabled,
      lastRunAt: a.lastRunAt,
      lastStatus: a.lastStatus,
      lastSummary: a.lastSummary,
      lastError: a.lastError,
      pendingCommand: a.commands[0]?.type ?? null,
    }))
  );
}
