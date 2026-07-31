import { prisma } from "./prisma";

const MEET_RECAP_SUGGESTIONS_KEY = "meet_recap_suggestions_enabled";
const MEET_RECAP_GMAIL_USER_KEY = "meet_recap_gmail_user_id";

// Sem linha na tabela Setting = ligado (comportamento histórico, antes de existir esse flag)
export async function isMeetRecapSuggestionsEnabled(): Promise<boolean> {
  const row = await prisma.setting.findUnique({ where: { key: MEET_RECAP_SUGGESTIONS_KEY } });
  return row?.value !== "false";
}

export async function setMeetRecapSuggestionsEnabled(enabled: boolean): Promise<void> {
  await prisma.setting.upsert({
    where: { key: MEET_RECAP_SUGGESTIONS_KEY },
    update: { value: String(enabled) },
    create: { key: MEET_RECAP_SUGGESTIONS_KEY, value: String(enabled) },
  });
}

// Qual conta do squad sincroniza os Meet Recaps do Gmail. Se mais de uma conta
// sincronizasse, o mesmo e-mail de recap (uma pessoa convidada em comum) chegaria
// duplicado em duas caixas diferentes — gmailId diferente em cada uma, então vira
// dois MeetRecap distintos pro mesmo encontro, com sugestões de tarefa divergentes.
// null/sem linha = sincroniza de todas as contas conectadas (comportamento histórico).
export async function getMeetRecapGmailUserId(): Promise<string | null> {
  const row = await prisma.setting.findUnique({ where: { key: MEET_RECAP_GMAIL_USER_KEY } });
  return row?.value || null;
}

export async function setMeetRecapGmailUserId(userId: string | null): Promise<void> {
  if (!userId) {
    await prisma.setting.deleteMany({ where: { key: MEET_RECAP_GMAIL_USER_KEY } });
    return;
  }
  await prisma.setting.upsert({
    where: { key: MEET_RECAP_GMAIL_USER_KEY },
    update: { value: userId },
    create: { key: MEET_RECAP_GMAIL_USER_KEY, value: userId },
  });
}
