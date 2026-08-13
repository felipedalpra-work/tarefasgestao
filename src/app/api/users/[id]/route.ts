import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isAdmin } from "@/lib/authz";
import { forSquad } from "@/lib/tenant-prisma";
import { revalidateTag } from "next/cache";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const db = forSquad(session.user.squadId);

  const { id } = await params;
  const body = await req.json();

  const data: { name?: string | null; cargo?: string | null; role?: string } = {};
  if ("name" in body) data.name = body.name || null;
  if ("cargo" in body) data.cargo = body.cargo || null;
  if ("role" in body && (body.role === "admin" || body.role === "member")) {
    if (!isAdmin(session)) return NextResponse.json({ error: "Só admin do squad pode mudar perfil de acesso" }, { status: 403 });
    data.role = body.role;
  }

  const user = await db.user.update({
    where: { id },
    data,
    select: { id: true, name: true, email: true, image: true, cargo: true, role: true },
  });

  revalidateTag("users", "max");

  return NextResponse.json(user);
}

// Remove um membro da equipe. Task/TaskComment/Tratativa apontam pro User sem
// onDelete: Cascade, então o Postgres rejeitaria a exclusão de qualquer jeito —
// checamos antes pra devolver um erro que explique o que precisa ser resolvido,
// em vez do erro cru de FK constraint. Só admin do squad pode remover gente.
export async function DELETE(req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdmin(session)) return NextResponse.json({ error: "Só admin do squad pode remover gente" }, { status: 403 });
  const db = forSquad(session.user.squadId);

  const { id } = await params;

  const [assignedTasks, createdTasks, comments, tratativasResp, tratativasCreated] = await Promise.all([
    db.task.count({ where: { assigneeId: id } }),
    db.task.count({ where: { createdById: id } }),
    db.taskComment.count({ where: { userId: id } }),
    db.tratativa.count({ where: { responsavelId: id } }),
    db.tratativa.count({ where: { createdById: id } }),
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

  await db.notification.deleteMany({ where: { userId: id } });
  await db.user.delete({ where: { id } });

  revalidateTag("users", "max");

  return NextResponse.json({ ok: true });
}
