import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

function accuracyOf(byStatus: { pending: number; accepted: number; edited: number; rejected: number }) {
  const evaluated = byStatus.accepted + byStatus.edited + byStatus.rejected;
  const accuracyPct = evaluated > 0 ? Math.round(((byStatus.accepted + byStatus.edited) / evaluated) * 100) : null;
  return { ...byStatus, evaluated, accuracyPct };
}

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const counts = await prisma.recapSuggestion.groupBy({
    by: ["status"],
    _count: true,
    where: { status: { not: "superseded" }, recap: { squadId: session.user.squadId } },
  });

  const byStatus = { pending: 0, accepted: 0, edited: 0, rejected: 0 };
  for (const c of counts) {
    if (c.status === "pending" || c.status === "accepted" || c.status === "edited" || c.status === "rejected") {
      byStatus[c.status] = c._count;
    }
  }

  // taxa de acerto por cliente — mesma conta de cima, só que agrupada pelo cliente do
  // recap (RecapSuggestion não tem client próprio, vem de recap.client); ajuda a ver
  // onde a IA erra mais, em vez de só uma média geral que esconde isso
  const suggestions = await prisma.recapSuggestion.findMany({
    where: { status: { not: "superseded" }, recap: { squadId: session.user.squadId } },
    select: { status: true, recap: { select: { client: true } } },
  });

  const perClient = new Map<string, { pending: number; accepted: number; edited: number; rejected: number }>();
  for (const s of suggestions) {
    const client = s.recap.client || "Sem cliente identificado";
    if (!perClient.has(client)) perClient.set(client, { pending: 0, accepted: 0, edited: 0, rejected: 0 });
    const bucket = perClient.get(client)!;
    if (s.status === "pending" || s.status === "accepted" || s.status === "edited" || s.status === "rejected") {
      bucket[s.status]++;
    }
  }

  const byClient = Array.from(perClient.entries())
    .map(([client, bucket]) => ({ client, ...accuracyOf(bucket) }))
    .filter((c) => c.evaluated > 0)
    .sort((a, b) => (a.accuracyPct ?? 100) - (b.accuracyPct ?? 100));

  return NextResponse.json({ ...accuracyOf(byStatus), byClient });
}
