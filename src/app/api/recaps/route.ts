import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const recaps = await prisma.meetRecap.findMany({
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
