import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const counts = await prisma.recapSuggestion.groupBy({
    by: ["status"],
    _count: true,
    where: { status: { not: "superseded" } },
  });

  const byStatus: Record<string, number> = { pending: 0, accepted: 0, edited: 0, rejected: 0 };
  for (const c of counts) byStatus[c.status] = c._count;

  const evaluated = byStatus.accepted + byStatus.edited + byStatus.rejected;
  const accuracyPct = evaluated > 0 ? Math.round(((byStatus.accepted + byStatus.edited) / evaluated) * 100) : null;

  return NextResponse.json({ ...byStatus, evaluated, accuracyPct });
}
