import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

const PAGE_SIZE = 50;

export async function GET(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { searchParams } = new URL(req.url);
    const category = searchParams.get("category") || undefined;
    const level = searchParams.get("level") || undefined;
    const before = searchParams.get("before") || undefined; // cursor: createdAt ISO do último item

    // logs do próprio squad + logs de sistema/cron (squadId null, sem dono específico)
    const logs = await prisma.platformLog.findMany({
      where: {
        OR: [{ squadId: session.user.squadId }, { squadId: null }],
        ...(category ? { category } : {}),
        ...(level ? { level } : {}),
        ...(before ? { createdAt: { lt: new Date(before) } } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: PAGE_SIZE + 1,
    });

    const hasMore = logs.length > PAGE_SIZE;
    return NextResponse.json({ logs: logs.slice(0, PAGE_SIZE), hasMore });
  } catch (err) {
    console.error("[api/logs]", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
    }
}
