import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { forSquad } from "@/lib/tenant-prisma";
import { notifyUser } from "@/lib/slack";
import { getBaseUrl } from "@/lib/base-url";
import { isNotificationEnabled } from "@/lib/settings";

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

  // menções @nome → notificação in-app + DM no Slack (Slack dá pra desligar em Configurações)
  const mentioned = content.match(/@([\p{L}]+)/gu);
  if (mentioned?.length) {
    const task = await db.task.findUnique({ where: { id }, select: { title: true } });
    const users = await db.user.findMany({ select: { id: true, name: true } });
    const authorFirst = session.user.name?.split(" ")[0] ?? "Alguém";
    const notified = new Set<string>();
    const slackEnabled = await isNotificationEnabled(session.user.squadId, "commentMention");

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

      if (slackEnabled) {
        notifyUser(
          session.user.squadId,
          target.id,
          `💬 *${authorFirst} mencionou você* em _${task?.title ?? "uma tarefa"}_:\n> ${content.trim()}\n\n<${getBaseUrl()}/tasks?task=${id}|Ver tarefa →>`
        ).catch((e) => console.error("[slack] menção:", e));
      }
    }
  }

  return NextResponse.json(comment, { status: 201 });
}
