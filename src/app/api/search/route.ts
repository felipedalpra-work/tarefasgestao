import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { forSquad } from "@/lib/tenant-prisma";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const db = forSquad(session.user.squadId);

  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) return NextResponse.json({ tasks: [], recaps: [], clients: [] });

  // "insensitive" em todo mundo — sem isso, "contains" no Postgres é sensível a maiúsculas/minúsculas
  // e "bairral" nunca acharia o cliente "Bairral" (bug real, confirmado direto no banco).
  const ci = { contains: q, mode: "insensitive" as const };

  const [tasks, recaps, events, notes] = await Promise.all([
    db.task.findMany({
      where: { OR: [{ title: ci }, { description: ci }, { client: ci }] },
      select: { id: true, title: true, status: true, priority: true, client: true, assignee: { select: { name: true } } },
      orderBy: { updatedAt: "desc" },
      take: 6,
    }),
    db.meetRecap.findMany({
      where: { OR: [{ subject: ci }, { client: ci }] },
      select: { id: true, subject: true, client: true, processedAt: true },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
    db.calendarEvent.findMany({
      where: { OR: [{ client: ci }, { title: ci }] },
      select: { id: true, title: true, client: true, startAt: true },
      orderBy: { startAt: "desc" },
      take: 5,
    }),
    // ClientNote é a única fonte pra cliente cadastrado na carteira mas ainda sem
    // nenhuma tarefa/reunião/recap — sem isso, cliente novo nunca aparece na busca.
    db.clientNote.findMany({
      where: { client: ci },
      select: { client: true },
      take: 10,
    }),
  ]);

  // Clientes: só entra quem tem o NOME batendo com a busca (não qualquer cliente "de
  // carona" que apareceu só porque o título de uma tarefa/recap dele bateu por outro motivo)
  const clientSet = new Set<string>();
  [...tasks, ...recaps, ...events].forEach((r) => { if ("client" in r && r.client) clientSet.add(r.client); });
  notes.forEach((n) => { if (n.client) clientSet.add(n.client); });
  const qLower = q.toLowerCase();
  const clients = Array.from(clientSet).filter((c) => c.toLowerCase().includes(qLower)).slice(0, 8);

  return NextResponse.json({ tasks, recaps, clients });
}
