import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { forSquad } from "@/lib/tenant-prisma";

// Só os status que /sugestoes-ia realmente exibe nas abas (Pendentes/Duplicadas/Excluídos).
// "rejected" PRECISA vir: é ele que alimenta a aba "Excluídos" — filtrar aqui fazia a
// sugestão descartada sumir de vez no primeiro refresh, como se o descarte não gravasse.
// "accepted"/"edited" ficam de fora porque já viraram tarefa no Kanban.
const VISIBLE_STATUSES = ["pending", "duplicate", "rejected"];

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const db = forSquad(session.user.squadId);

  const suggestions = await db.externalSuggestion.findMany({
    where: { status: { in: VISIBLE_STATUSES } },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(suggestions);
}
