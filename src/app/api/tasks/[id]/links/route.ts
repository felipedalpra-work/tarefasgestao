import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { revalidateTag } from "next/cache";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const links = await prisma.taskLink.findMany({
    where: { taskId: id, task: { squadId: session.user.squadId } },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json(links);
}

export async function POST(req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const { url, label } = await req.json();
  if (!url?.trim()) return NextResponse.json({ error: "URL obrigatória" }, { status: 400 });

  const task = await prisma.task.findUnique({ where: { id, squadId: session.user.squadId }, select: { id: true } });
  if (!task) return NextResponse.json({ error: "Tarefa não encontrada" }, { status: 404 });

  let normalized = url.trim();
  if (!/^https?:\/\//i.test(normalized)) normalized = `https://${normalized}`;

  const link = await prisma.taskLink.create({
    data: { taskId: id, url: normalized, label: label?.trim() || null },
  });

  revalidateTag("tasks", "max");
  return NextResponse.json(link, { status: 201 });
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await params;
  const linkId = new URL(req.url).searchParams.get("linkId");
  if (!linkId) return NextResponse.json({ error: "linkId obrigatório" }, { status: 400 });

  const link = await prisma.taskLink.findUnique({ where: { id: linkId }, select: { task: { select: { squadId: true } } } });
  if (!link || link.task.squadId !== session.user.squadId) {
    return NextResponse.json({ error: "Link não encontrado" }, { status: 404 });
  }

  await prisma.taskLink.delete({ where: { id: linkId } });
  revalidateTag("tasks", "max");
  return NextResponse.json({ ok: true });
}
