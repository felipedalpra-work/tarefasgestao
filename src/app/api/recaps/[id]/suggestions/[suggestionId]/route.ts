import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const STATUS_VALUES = ["pending", "rejected"];

type Params = { params: Promise<{ id: string; suggestionId: string }> };

// Só permite marcar como "rejected" (descartar) ou voltar pra "pending" (desfazer descarte).
// Aceitar/editar uma sugestão acontece via POST /api/tasks (recapSuggestionId), não aqui.
export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id, suggestionId } = await params;
  const body = await req.json();

  if (!STATUS_VALUES.includes(body.status)) {
    return NextResponse.json({ error: "status inválido" }, { status: 400 });
  }

  const suggestion = await prisma.recapSuggestion.findUnique({ where: { id: suggestionId } });
  if (!suggestion || suggestion.recapId !== id) {
    return NextResponse.json({ error: "Sugestão não encontrada" }, { status: 404 });
  }

  const updated = await prisma.recapSuggestion.update({
    where: { id: suggestionId },
    data: { status: body.status },
  });

  return NextResponse.json(updated);
}
