import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { forSquad } from "@/lib/tenant-prisma";

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const db = forSquad(session.user.squadId);

  // `body` fora da lista de propósito — depois do backfill da ata completa (2026-10-23)
  // alguns passaram de ~2-5KB pra até 20KB cada; com 150+ recaps isso inflava a resposta
  // pra alguns MB, deixando a tela (e qualquer ação que dá refetch, tipo "Extrair
  // tarefas") lenta a ponto de parecer travada. Ninguém usa o body aqui na lista — só
  // quando a pessoa expande UM recap e clica "Ver e-mail original" (GET /api/recaps/[id]).
  const recaps = await db.meetRecap.findMany({
    orderBy: { createdAt: "desc" },
    omit: { body: true },
    include: {
      suggestions: {
        where: { status: { not: "superseded" } },
        orderBy: { index: "asc" },
      },
    },
  });

  return NextResponse.json(recaps);
}
