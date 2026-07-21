import { prisma } from "./prisma";

const MEET_RECAP_SUGGESTIONS_KEY = "meet_recap_suggestions_enabled";

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
