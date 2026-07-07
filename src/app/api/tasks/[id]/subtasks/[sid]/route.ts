import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { revalidateTag } from "next/cache";

type Params = { params: Promise<{ id: string; sid: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { sid } = await params;
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
  await prisma.subtask.delete({ where: { id: sid } });
  revalidateTag("tasks", "max");
  return NextResponse.json({ ok: true });
}
