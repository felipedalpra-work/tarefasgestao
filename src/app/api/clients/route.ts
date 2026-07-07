import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Lista de nomes de clientes conhecidos (de eventos, recaps e tarefas)
export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [events, recaps, tasks] = await Promise.all([
    prisma.calendarEvent.findMany({ select: { client: true }, where: { client: { not: "" } }, distinct: ["client"] }),
    prisma.meetRecap.findMany({ select: { client: true }, where: { client: { not: null } }, distinct: ["client"] }),
    prisma.task.findMany({ select: { client: true }, where: { client: { not: null } }, distinct: ["client"] }),
  ]);

  const names = new Set<string>();
  events.forEach((e) => e.client && names.add(e.client));
  recaps.forEach((r) => r.client && names.add(r.client));
  tasks.forEach((t) => t.client && names.add(t.client));

  return NextResponse.json([...names].sort((a, b) => a.localeCompare(b)));
}
