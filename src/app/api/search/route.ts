import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) return NextResponse.json({ tasks: [], recaps: [], clients: [] });

  const [tasks, recaps, events] = await Promise.all([
    prisma.task.findMany({
      where: {
        OR: [
          { title: { contains: q } },
          { description: { contains: q } },
          { client: { contains: q } },
        ],
      },
      select: { id: true, title: true, status: true, priority: true, client: true, assignee: { select: { name: true } } },
      orderBy: { updatedAt: "desc" },
      take: 6,
    }),
    prisma.meetRecap.findMany({
      where: { OR: [{ subject: { contains: q } }, { client: { contains: q } }] },
      select: { id: true, subject: true, client: true, processedAt: true },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
    prisma.calendarEvent.findMany({
      where: { OR: [{ client: { contains: q } }, { title: { contains: q } }] },
      select: { id: true, title: true, client: true, startAt: true },
      orderBy: { startAt: "desc" },
      take: 5,
    }),
  ]);

  // Unique clients from all sources
  const clientSet = new Set<string>();
  [...tasks, ...recaps, ...events].forEach((r) => {
    if ("client" in r && r.client) clientSet.add(r.client);
  });

  return NextResponse.json({ tasks, recaps, clients: Array.from(clientSet) });
}
