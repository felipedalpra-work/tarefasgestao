import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { forSquad } from "@/lib/tenant-prisma";

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const db = forSquad(session.user.squadId);

  const recaps = await db.meetRecap.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      suggestions: {
        where: { status: { not: "superseded" } },
        orderBy: { index: "asc" },
      },
    },
  });

  return NextResponse.json(recaps);
}
