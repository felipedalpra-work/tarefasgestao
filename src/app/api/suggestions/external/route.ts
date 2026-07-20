import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const suggestions = await prisma.externalSuggestion.findMany({
    where: { status: { not: "rejected" } },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(suggestions);
}
