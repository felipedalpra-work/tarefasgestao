import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { revalidateTag } from "next/cache";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();

  const data: { name?: string | null; cargo?: string | null } = {};
  if ("name" in body) data.name = body.name || null;
  if ("cargo" in body) data.cargo = body.cargo || null;

  const user = await prisma.user.update({
    where: { id },
    data,
    select: { id: true, name: true, email: true, image: true, cargo: true },
  });

  revalidateTag("users", "max");

  return NextResponse.json(user);
}

// Remove um membro da equipe. Task/TaskComment/Tratativa apontam pro User sem
// onDelete: Cascade, então o Postgres rejeitaria a exclusão de qualquer jeito —
// checamos antes pra devolver um erro que explique o que precisa ser resolvido,
// em vez do erro cru de FK constraint.
export async function DELETE(req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const [assignedTasks, createdTasks, comments, tratativasResp, tratativasCreated] = await Promise.all([
    prisma.task.count({ where: { assigneeId: id } }),
    prisma.task.count({ where: { createdById: id } }),
    prisma.taskComment.count({ where: { userId: id } }),
    prisma.tratativa.count({ where: { responsavelId: id } }),
    prisma.tratativa.count({ where: { createdById: id } }),
  ]);

  const totalTasks = assignedTasks + createdTasks;
  const totalTratativas = tratativasResp + tratativasCreated;

  if (totalTasks > 0 || comments > 0 || totalTratativas > 0) {
    const pending: string[] = [];
    if (totalTasks > 0) pending.push(`${totalTasks} tarefa(s)`);
    if (comments > 0) pending.push(`${comments} comentário(s)`);
    if (totalTratativas > 0) pending.push(`${totalTratativas} tratativa(s)`);
    return NextResponse.json(
      { error: `Não é possível remover: essa pessoa ainda tem ${pending.join(", ")} vinculados. Reatribua antes de remover.` },
      { status: 409 }
    );
  }

  await prisma.notification.deleteMany({ where: { userId: id } });
  await prisma.user.delete({ where: { id } });

  revalidateTag("users", "max");

  return NextResponse.json({ ok: true });
}
