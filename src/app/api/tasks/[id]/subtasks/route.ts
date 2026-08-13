import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { revalidateTag } from "next/cache";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const subtasks = await prisma.subtask.findMany({
    where: { taskId: id, task: { squadId: session.user.squadId } },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
  return NextResponse.json(subtasks);
}

export async function POST(req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const { title } = await req.json();
  if (!title?.trim()) return NextResponse.json({ error: "Título obrigatório" }, { status: 400 });

  // confirma que a task é do squad de quem está pedindo antes de criar a subtask
  const task = await prisma.task.findUnique({ where: { id, squadId: session.user.squadId }, select: { id: true } });
  if (!task) return NextResponse.json({ error: "Tarefa não encontrada" }, { status: 404 });

  const last = await prisma.subtask.findFirst({
    where: { taskId: id },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });

  const subtask = await prisma.subtask.create({
    data: { taskId: id, title: title.trim(), sortOrder: (last?.sortOrder ?? 0) + 1 },
  });

  revalidateTag("tasks", "max");
  return NextResponse.json(subtask, { status: 201 });
}
