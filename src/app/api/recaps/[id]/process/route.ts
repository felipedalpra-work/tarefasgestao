import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { forSquad } from "@/lib/tenant-prisma";
import { processRecap } from "@/lib/process-recap";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const db = forSquad(session.user.squadId);

  const { id } = await params;

  // confirma que o recap é do squad de quem está pedindo, antes de reprocessar — senão
  // dava pra forçar reprocessamento (e ver o resultado) de um recap de outro squad
  const recap = await db.meetRecap.findUnique({ where: { id }, select: { id: true } });
  if (!recap) return NextResponse.json({ error: "Recap não encontrado" }, { status: 404 });

  // força reprocessar mesmo se já foi processado antes — preserva o histórico de sugestões
  // já aceitas/editadas/rejeitadas, só marca as pendentes antigas como "superseded"
  const count = await processRecap(id, { force: true });

  const suggestions = await db.recapSuggestion.findMany({
    where: { recapId: id, status: { not: "superseded" } },
    orderBy: { index: "asc" },
  });

  if (suggestions.length === 0 && count === 0) {
    return NextResponse.json({ error: "Nenhuma tarefa identificada na transcrição.", suggestions: [] }, { status: 200 });
  }

  return NextResponse.json({ suggestions, count });
}
