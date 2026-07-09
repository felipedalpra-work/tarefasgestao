import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { processRecap } from "@/lib/process-recap";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  // força reprocessar mesmo se já foi processado antes — preserva o histórico de sugestões
  // já aceitas/editadas/rejeitadas, só marca as pendentes antigas como "superseded"
  const count = await processRecap(id, { force: true });

  const suggestions = await prisma.recapSuggestion.findMany({
    where: { recapId: id, status: { not: "superseded" } },
    orderBy: { index: "asc" },
  });

  if (suggestions.length === 0 && count === 0) {
    return NextResponse.json({ error: "Nenhuma tarefa identificada na transcrição.", suggestions: [] }, { status: 200 });
  }

  return NextResponse.json({ suggestions, count });
}
