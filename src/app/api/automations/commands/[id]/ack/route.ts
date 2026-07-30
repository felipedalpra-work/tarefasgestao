import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { log } from "@/lib/logger";
import { checkAutomationsSecret } from "@/lib/automations";

type Params = { params: Promise<{ id: string }> };

// Chamado pela bridge do Claude/Cowork depois de processar um comando —
// marca como "done" (aplicado com sucesso) ou "failed" (não deu, com o
// motivo em resultDetail).
export async function POST(req: NextRequest, { params }: Params) {
  if (!checkAutomationsSecret(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const status = body?.status;
  if (status !== "done" && status !== "failed") {
    return NextResponse.json({ error: 'status deve ser "done" ou "failed"' }, { status: 400 });
  }

  const command = await prisma.automationCommand.update({
    where: { id },
    data: { status, resultDetail: body?.resultDetail ?? null, processedAt: new Date() },
    include: { automation: { select: { name: true } } },
  });

  if (status === "failed") {
    await log("automations", `${command.automation.name}: comando "${command.type}" falhou`, {
      level: "error",
      detail: body?.resultDetail,
    });
  }

  return NextResponse.json({ ok: true });
}
