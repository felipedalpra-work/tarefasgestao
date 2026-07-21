import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { notifyTaskReminder } from "@/lib/slack";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const task = await prisma.task.findUnique({ where: { id } });
  if (!task) return NextResponse.json({ error: "Tarefa não encontrada" }, { status: 404 });
  if (!task.assigneeId) return NextResponse.json({ error: "Essa tarefa não tem responsável definido" }, { status: 400 });

  const result = await notifyTaskReminder({
    assigneeDbId: task.assigneeId,
    taskId: task.id,
    taskTitle: task.title,
    taskDescription: task.description,
    priority: task.priority,
    dueDate: task.dueDate,
    client: task.client,
    requestedBy: session.user.name,
  });

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ ok: true });
}
