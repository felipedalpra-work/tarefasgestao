import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkAutomationsSecret } from "@/lib/automations";

// Chamado pela tarefa agendada "automations-bridge" do Claude/Cowork, que
// faz polling periódico e executa o efeito real de cada comando (disparar a
// skill correspondente, ou pausar/reativar a tarefa agendada no lado dela).
export async function GET(req: NextRequest) {
  if (!checkAutomationsSecret(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const commands = await prisma.automationCommand.findMany({
    where: { status: "pending" },
    orderBy: { requestedAt: "asc" },
    include: { automation: { select: { key: true, name: true } } },
  });

  return NextResponse.json(
    commands.map((c) => ({
      id: c.id,
      type: c.type,
      requestedAt: c.requestedAt,
      requestedById: c.requestedById,
      automationKey: c.automation.key,
      automationName: c.automation.name,
    }))
  );
}
