import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

const PAGE_SIZE = 50;

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const category = searchParams.get("category") || undefined;
    const level = searchParams.get("level") || undefined;
    const before = searchParams.get("before") || undefined; // cursor: createdAt ISO do último item

    const logs = await prisma.platformLog.findMany({
      where: {
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
