import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { forSquad } from "@/lib/tenant-prisma";

type Params = { params: Promise<{ id: string }> };

// Corpo completo de um recap, sob demanda — GET /api/recaps (lista) omite `body` de
// propósito (ver comentário lá) pra não inflar a resposta com todo o histórico de uma
// vez. Usado só quando a pessoa expande um recap e clica "Ver e-mail original".
export async function GET(_req: Request, { params }: Params) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const db = forSquad(session.user.squadId);

  const { id } = await params;
  const recap = await db.meetRecap.findUnique({ where: { id }, select: { body: true } });
  if (!recap) return NextResponse.json({ error: "Recap não encontrado" }, { status: 404 });

  return NextResponse.json(recap);
}
