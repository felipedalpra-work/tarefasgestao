import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { revalidateTag } from "next/cache";

type Params = { params: Promise<{ id: string; sid: string }> };

// Subtask não tem squadId próprio (é filha de Task) — update/delete por id não aceita
// filtro de relação direto, então confirma o squad via o pai antes de mexer.
async function ownedByCallerSquad(sid: string, squadId: string): Promise<boolean> {
  const subtask = await prisma.subtask.findUnique({ where: { id: sid }, select: { task: { select: { squadId: true } } } });
  return subtask?.task.squadId === squadId;
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { sid } = await params;
  if (!(await ownedByCallerSquad(sid, session.user.squadId))) {
    return NextResponse.json({ error: "Subtask não encontrada" }, { status: 404 });
  }

  const body = await req.json();
  const subtask = await prisma.subtask.update({
    where: { id: sid },
    data: {
      ...(body.done !== undefined && { done: body.done }),
      ...(body.title && { title: body.title }),
    },
  });

  revalidateTag("tasks", "max");
  return NextResponse.json(subtask);
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { sid } = await params;
  if (!(await ownedByCallerSquad(sid, session.user.squadId))) {
    return NextResponse.json({ error: "Subtask não encontrada" }, { status: 404 });
  }

  await prisma.subtask.delete({ where: { id: sid } });
  revalidateTag("tasks", "max");
  return NextResponse.json({ ok: true });
}
