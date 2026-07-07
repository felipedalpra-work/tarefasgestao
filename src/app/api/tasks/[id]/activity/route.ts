import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const activities = await prisma.taskActivity.findMany({
    where: { taskId: id },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return NextResponse.json(activities);
}
