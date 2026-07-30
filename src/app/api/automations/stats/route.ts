import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Estatísticas pro painel /automacoes: visão geral (últimos 30 dias) + histórico
// recente por automação + últimos erros. Separado de GET /api/automations (que a
// página faz polling a cada 30s) pra não pesar esse ciclo com as agregações.
export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const since30d = new Date();
  since30d.setDate(since30d.getDate() - 30);

  const automations = await prisma.automation.findMany({
    select: {
      key: true,
      name: true,
      runs: {
        orderBy: { finishedAt: "desc" },
        take: 200, // suficiente pra qualquer rotina semanal/diária sem crescer sem limite
        select: { status: true, finishedAt: true, summary: true, detail: true },
      },
    },
  });

  let totalRuns30d = 0;
  let successRuns30d = 0;
  let errorRuns30d = 0;
  const recentErrors: { automationName: string; finishedAt: Date; summary: string | null; detail: string | null }[] = [];

  const perAutomation = automations.map((a) => {
    const totalRuns = a.runs.length;
    const successCount = a.runs.filter((r) => r.status === "success").length;
    const errorCount = a.runs.filter((r) => r.status === "error").length;

    for (const r of a.runs) {
      if (r.finishedAt >= since30d) {
        totalRuns30d++;
        if (r.status === "success") successRuns30d++;
        if (r.status === "error") errorRuns30d++;
      }
      if (r.status === "error") {
        recentErrors.push({ automationName: a.name, finishedAt: r.finishedAt, summary: r.summary, detail: r.detail });
      }
    }

    return {
      key: a.key,
      name: a.name,
      totalRuns,
      successCount,
      errorCount,
      recentRuns: a.runs.slice(0, 10).map((r) => ({ status: r.status, finishedAt: r.finishedAt })),
    };
  });

  recentErrors.sort((x, y) => y.finishedAt.getTime() - x.finishedAt.getTime());

  const mostUsed = perAutomation.reduce<(typeof perAutomation)[number] | null>(
    (max, a) => (a.totalRuns > 0 && a.totalRuns > (max?.totalRuns ?? 0) ? a : max),
    null
  );

  return NextResponse.json({
    totalRuns30d,
    successRate30d: totalRuns30d > 0 ? Math.round((successRuns30d / totalRuns30d) * 100) : null,
    errorRuns30d,
    mostUsed: mostUsed ? { name: mostUsed.name, key: mostUsed.key, totalRuns: mostUsed.totalRuns } : null,
    perAutomation,
    recentErrors: recentErrors.slice(0, 5),
  });
}
