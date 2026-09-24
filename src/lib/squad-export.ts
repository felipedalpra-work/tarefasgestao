import { prisma } from "@/lib/prisma";
import { forSquad } from "@/lib/tenant-prisma";

// Monta o export completo de UM squad — usado tanto pelo botão manual
// (/api/export, só admin, sob demanda) quanto pelo backup diário por e-mail
// (src/lib/backup-email.ts). Mesma lógica em um lugar só.
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
// próprio vazando entre squads), esta função não confia em lembrar qual modelo está em
// qual lista — cada query se prova sozinha.
export async function buildSquadExport(squadId: string) {
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

  return {
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
}

export type SquadExport = Awaited<ReturnType<typeof buildSquadExport>>;
