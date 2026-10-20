import { prisma } from "./prisma";
import { decryptSecret } from "./credential-crypto";
import { getMeetRecapGmailUserId } from "./settings";

// Convenção da chave: mesmo truque já usado pelo Slack (src/lib/slack.ts,
// "slack_user_<id>") pra guardar um valor por usuário dentro da tabela
// Setting (que é só por squad, sem coluna userId própria) — só que aqui é
// self-service (o próprio usuário mexe só na própria linha, sem admin no meio).
export function geminiKeySettingKey(userId: string): string {
  return `gemini_api_key_user_${userId}`;
}

export type RecapAiConfig = { provider: "groq" } | { provider: "gemini"; apiKey: string };

// Meet Recap roda em background pro squad inteiro, não é ação de uma pessoa —
// usa a chave de quem é a pessoa "designada" pra sincronizar Meet Recap desse
// squad (Configurações → Squad). Sem designado, ou sem chave conectada por
// ele, cai no Groq do squad (comportamento de sempre, sem mudança).
export async function getRecapAiConfig(squadId: string): Promise<RecapAiConfig> {
  const userId = await getMeetRecapGmailUserId(squadId);
  if (!userId) return { provider: "groq" };

  const row = await prisma.setting.findUnique({
    where: { squadId_key: { squadId, key: geminiKeySettingKey(userId) } },
  });
  if (!row) return { provider: "groq" };

  try {
    return { provider: "gemini", apiKey: decryptSecret(row.value) };
  } catch {
    // blob corrompido/chave de criptografia trocada — cai pro Groq em vez de quebrar
    return { provider: "groq" };
  }
}
