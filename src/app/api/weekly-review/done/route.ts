import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { forSquad } from "@/lib/tenant-prisma";
import { currentWeekKey } from "@/lib/utils";

// Marca/desmarca um cliente como revisado na Revisão Semanal — compartilhado pelo squad
// inteiro (era só localStorage antes: cada pessoa via o próprio estado, Gustavo marcava
// num navegador e Tainara via tudo desmarcado no dela). weekKey some sozinho na semana
// seguinte, não precisa de rotina de limpeza.
export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const db = forSquad(session.user.squadId);

  const body = await req.json();
  const client = typeof body.client === "string" ? body.client.trim() : "";
  if (!client) return NextResponse.json({ error: "client é obrigatório" }, { status: 400 });

  const weekKey = currentWeekKey();

  if (body.done) {
    await db.weeklyReviewDone.upsert({
      where: { squadId_weekKey_client: { squadId: session.user.squadId, weekKey, client } },
      update: {},
      create: { squadId: session.user.squadId, weekKey, client, doneById: session.user.id },
    });
  } else {
    await db.weeklyReviewDone.deleteMany({ where: { weekKey, client } });
  }

  return NextResponse.json({ ok: true });
}
