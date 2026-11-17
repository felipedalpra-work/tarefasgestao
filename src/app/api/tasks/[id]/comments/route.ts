import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { forSquad } from "@/lib/tenant-prisma";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const db = forSquad(session.user.squadId);

  const { id } = await params;
  const comments = await db.taskComment.findMany({
    where: { taskId: id },
    include: { user: { select: { id: true, name: true, image: true } } },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json(comments);
}

export async function POST(req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const db = forSquad(session.user.squadId);

  const { id } = await params;
  const { content } = await req.json();
  if (!content?.trim()) return NextResponse.json({ error: "Conteúdo obrigatório" }, { status: 400 });

  const comment = await db.taskComment.create({
    data: { taskId: id, userId: session.user.id, content: content.trim() },
    include: { user: { select: { id: true, name: true, image: true } } },
  });

  // menções @nome → notificação in-app
  const mentioned = content.match(/@([\p{L}]+)/gu);
  if (mentioned?.length) {
    const task = await db.task.findUnique({ where: { id }, select: { title: true } });
    const users = await db.user.findMany({ select: { id: true, name: true } });
    const authorFirst = session.user.name?.split(" ")[0] ?? "Alguém";
    const notified = new Set<string>();

    for (const raw of mentioned) {
      const name = raw.slice(1).toLowerCase();
      const target = users.find(
        (u) => u.name && u.name.toLowerCase().split(" ").some((part) => part === name)
      );
      if (!target || target.id === session.user.id || notified.has(target.id)) continue;
      notified.add(target.id);

      await db.notification.create({
        data: {
          squadId: session.user.squadId,
          userId: target.id,
          type: "mention",
          message: `${authorFirst} mencionou você em "${task?.title ?? "uma tarefa"}"`,
          link: `/tasks?task=${id}`,
        },
      }).catch((e) => console.error("[notification]", e));
    }
  }

  return NextResponse.json(comment, { status: 201 });
}
