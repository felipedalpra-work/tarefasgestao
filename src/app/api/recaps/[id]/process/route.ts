import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { processRecap } from "@/lib/process-recap";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  // permite reprocessar mesmo se já foi processado
  await prisma.meetRecap.update({
    where: { id },
    data: { processedAt: null, suggestedTasks: null },
  });

  const created = await processRecap(id);
  const recap = await prisma.meetRecap.findUnique({ where: { id } });
  const tasks = recap?.suggestedTasks ? JSON.parse(recap.suggestedTasks) : [];

  if (tasks.length === 0 && created === 0) {
    return NextResponse.json({ error: "Nenhuma tarefa identificada na transcrição.", tasks: [] }, { status: 200 });
  }

  return NextResponse.json({ tasks, created });
}
