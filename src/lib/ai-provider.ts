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

// Preferência de qual provedor usar — independente de ter ou não uma chave
// Gemini conectada. Conectar Gemini não força o uso dele: a pessoa pode
// querer voltar pro Groq sem desconectar a chave (ex: testando qual dá
// resultado melhor). Default "gemini" quando conectado, pra bater com o
// comportamento de antes desse switch existir.
export function geminiPreferenceSettingKey(userId: string): string {
  return `ai_provider_user_${userId}`;
}

export type RecapAiConfig = { provider: "groq" } | { provider: "gemini"; apiKey: string };

// Meet Recap roda em background pro squad inteiro, não é ação de uma pessoa —
// usa a chave de quem é a pessoa "designada" pra sincronizar Meet Recap desse
// squad (Configurações → Squad). Sem designado, sem chave conectada por ele,
// ou com a preferência dele explicitamente em "groq", cai no Groq do squad.
export async function getRecapAiConfig(squadId: string): Promise<RecapAiConfig> {
  const userId = await getMeetRecapGmailUserId(squadId);
  if (!userId) return { provider: "groq" };

  const [keyRow, prefRow] = await Promise.all([
    prisma.setting.findUnique({ where: { squadId_key: { squadId, key: geminiKeySettingKey(userId) } } }),
    prisma.setting.findUnique({ where: { squadId_key: { squadId, key: geminiPreferenceSettingKey(userId) } } }),
  ]);
  if (!keyRow) return { provider: "groq" };
  if (prefRow?.value === "groq") return { provider: "groq" };

  try {
    return { provider: "gemini", apiKey: decryptSecret(keyRow.value) };
  } catch {
    // blob corrompido/chave de criptografia trocada — cai pro Groq em vez de quebrar
    return { provider: "groq" };
  }
}
