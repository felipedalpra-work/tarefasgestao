import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { log } from "@/lib/logger";
import { checkAutomationsSecret, ensureKnownAutomations } from "@/lib/automations";

// Chamado pela própria rotina (tarefa agendada do Claude/Cowork) ao final de
// cada execução — sucesso ou erro. Faz upsert da Automation por "key" (cria
// se ainda não existir, pra permitir rotinas novas sem precisar tocar no
// código deste app) e grava uma linha em AutomationRun pro histórico.
export async function POST(req: NextRequest) {
  if (!checkAutomationsSecret(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const { key, status, summary, detail, startedAt, name, client, scheduleLabel } = body ?? {};

  if (!key || typeof key !== "string") {
    return NextResponse.json({ error: "key é obrigatório" }, { status: 400 });
  }
  if (status !== "success" && status !== "error") {
    return NextResponse.json({ error: 'status deve ser "success" ou "error"' }, { status: 400 });
  }

  await ensureKnownAutomations();

  const automation = await prisma.automation.upsert({
    where: { key },
    update: {
      lastRunAt: new Date(),
      lastStatus: status,
      lastSummary: summary ?? null,
      lastError: status === "error" ? (detail ?? summary ?? "Erro sem detalhe") : null,
    },
    create: {
      key,
      name: name || key,
      client: client ?? null,
      scheduleLabel: scheduleLabel || "—",
      lastRunAt: new Date(),
      lastStatus: status,
      lastSummary: summary ?? null,
      lastError: status === "error" ? (detail ?? summary ?? "Erro sem detalhe") : null,
    },
  });

  await prisma.automationRun.create({
    data: {
      automationId: automation.id,
      status,
      summary: summary ?? null,
      detail: detail ?? null,
      startedAt: startedAt ? new Date(startedAt) : null,
    },
  });

  await log("automations", `${automation.name}: ${status === "success" ? "execução concluída" : "falhou"}${summary ? ` — ${summary}` : ""}`, {
    level: status === "error" ? "error" : "info",
    detail: detail ?? undefined,
  });

  return NextResponse.json({ ok: true });
}
