import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { forSquad } from "@/lib/tenant-prisma";
import { isAdmin } from "@/lib/authz";
import { log } from "@/lib/logger";

// Export completo dos dados do squad — segurança/portabilidade: garante que o squad
// nunca fica refém da plataforma pra ter acesso ao próprio dado. Só admin (mesmo nível
// de "excluir cliente"/"remover membro"), porque é a ação de maior alcance que existe
// no app: baixa TUDO de uma vez.
//
// Fora do arquivo de propósito: `ClientLogin` inteiro (login/senha/TOTP de ERP de
// cliente — decisão explícita do usuário: quem precisar continua revelando um de cada
// vez, com log, como já é hoje) e qualquer coisa de autenticação (senha de usuário,
// tokens de sessão/OAuth/reset de senha, hash de convite) — isso é segredo de
// infraestrutura, não "dado do squad".
//
// AssistantAction e Invite têm squadId próprio mas NÃO estão em SCOPED_MODELS
// (tenant-prisma.ts) — o forSquad() não os escopa sozinho. Toda query aqui filtra
// squadId explicitamente, mesmo nos modelos que já são escopados automaticamente:
// depois do vazamento achado mais cedo hoje (TaskActivity/RecapSuggestion sem squadId
// próprio vazando entre squads), esta rota não confia em lembrar qual modelo está em
// qual lista — cada query se prova sozinha.
export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdmin(session)) return NextResponse.json({ error: "Só admin do squad pode exportar os dados" }, { status: 403 });

  const squadId = session.user.squadId;
  const db = forSquad(squadId);

  const squad = await prisma.squad.findUnique({ where: { id: squadId }, select: { id: true, name: true, slug: true, createdAt: true } });

  const [
    users, tasks, clientNotes, calendarEvents, meetRecaps, externalSuggestions,
    tratativas, setupMeetings, fechamentosMensais, automations, settings, assistantActions, invites,
  ] = await Promise.all([
    // sem `password` — é hash de credencial, não dado do squad
    db.user.findMany({
      where: { squadId },
      select: { id: true, role: true, name: true, email: true, image: true, cargo: true, onboardingCompletedAt: true, createdAt: true, updatedAt: true },
      orderBy: { createdAt: "asc" },
    }),
    db.task.findMany({
      where: { squadId },
      include: { assignees: true, subtasks: true, activities: true, links: true, comments: true },
      orderBy: { createdAt: "asc" },
    }),
    db.clientNote.findMany({ where: { squadId }, orderBy: { client: "asc" } }),
    db.calendarEvent.findMany({ where: { squadId }, orderBy: { startAt: "asc" } }),
    db.meetRecap.findMany({ where: { squadId }, include: { suggestions: true }, orderBy: { createdAt: "asc" } }),
    db.externalSuggestion.findMany({ where: { squadId }, orderBy: { createdAt: "asc" } }),
    db.tratativa.findMany({ where: { squadId }, orderBy: { createdAt: "asc" } }),
    db.setupMeeting.findMany({ where: { squadId }, orderBy: { client: "asc" } }),
    db.fechamentoMensal.findMany({ where: { squadId }, orderBy: [{ year: "asc" }, { month: "asc" }] }),
    db.automation.findMany({ where: { squadId }, include: { runs: true, commands: true }, orderBy: { createdAt: "asc" } }),
    db.setting.findMany({ where: { squadId } }),
    db.assistantAction.findMany({ where: { squadId }, orderBy: { createdAt: "asc" } }),
    // sem `tokenHash` — é segredo de convite, não dado do squad
    db.invite.findMany({
      where: { squadId },
      select: { id: true, email: true, name: true, role: true, invitedByName: true, expiresAt: true, acceptedAt: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  // AssistantMessage não tem squadId (é por usuário) — junta pelos ids dos usuários
  // do squad que acabamos de buscar, já filtrados
  const userIds = users.map((u) => u.id);
  const assistantMessages =
    userIds.length > 0
      ? await prisma.assistantMessage.findMany({ where: { userId: { in: userIds } }, orderBy: { createdAt: "asc" } })
      : [];

  await log("data-export", `Export completo de dados gerado — squad ${squad?.name ?? squadId}`, {
    detail: `por ${session.user.name ?? session.user.id}`,
  });

  const payload = {
    exportedAt: new Date().toISOString(),
    squad,
    users,
    tasks,
    clientNotes,
    calendarEvents,
    meetRecaps,
    externalSuggestions,
    tratativas,
    setupMeetings,
    fechamentosMensais,
    automations,
    settings,
    assistantActions,
    assistantMessages,
    invites,
  };

  const dateSlug = new Date().toISOString().slice(0, 10);
  const filename = `export-${squad?.slug ?? squadId}-${dateSlug}.json`;

  return new NextResponse(JSON.stringify(payload, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
