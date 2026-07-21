import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Lista de nomes de clientes conhecidos (carteira em ClientNote + eventos, recaps e tarefas —
// ClientNote é a fonte de verdade de quais clientes existem, ver getClientsTable em src/lib/queries.ts;
// sem ela, cliente só cadastrado na carteira, ainda sem nenhuma atividade, não aparece aqui)
export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [notes, events, recaps, tasks] = await Promise.all([
    prisma.clientNote.findMany({ select: { client: true } }),
    prisma.calendarEvent.findMany({ select: { client: true }, where: { client: { not: "" } }, distinct: ["client"] }),
    prisma.meetRecap.findMany({ select: { client: true }, where: { client: { not: null } }, distinct: ["client"] }),
    prisma.task.findMany({ select: { client: true }, where: { client: { not: null } }, distinct: ["client"] }),
  ]);

  const names = new Set<string>();
  notes.forEach((n) => n.client && names.add(n.client));
  events.forEach((e) => e.client && names.add(e.client));
  recaps.forEach((r) => r.client && names.add(r.client));
  tasks.forEach((t) => t.client && names.add(t.client));

  return NextResponse.json([...names].sort((a, b) => a.localeCompare(b)));
}
