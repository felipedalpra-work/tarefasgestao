import crypto from "crypto";
import { prisma } from "./prisma";

const MEET_RECAP_SUGGESTIONS_KEY = "meet_recap_suggestions_enabled";
const MEET_RECAP_GMAIL_USER_KEY = "meet_recap_gmail_user_id";
const N8N_WEBHOOK_SECRET_KEY = "n8n_webhook_secret";
const BILLING_DRAFT_OWNER_KEY = "billing_draft_owner_user_id";

// Sem linha na tabela Setting = ligado (comportamento histórico, antes de existir esse flag)
export async function isMeetRecapSuggestionsEnabled(squadId: string): Promise<boolean> {
  const row = await prisma.setting.findUnique({ where: { squadId_key: { squadId, key: MEET_RECAP_SUGGESTIONS_KEY } } });
  return row?.value !== "false";
}

export async function setMeetRecapSuggestionsEnabled(squadId: string, enabled: boolean): Promise<void> {
  await prisma.setting.upsert({
    where: { squadId_key: { squadId, key: MEET_RECAP_SUGGESTIONS_KEY } },
    update: { value: String(enabled) },
    create: { squadId, key: MEET_RECAP_SUGGESTIONS_KEY, value: String(enabled) },
  });
}

// Qual conta do squad sincroniza os Meet Recaps do Gmail. Se mais de uma conta
// sincronizasse, o mesmo e-mail de recap (uma pessoa convidada em comum) chegaria
// duplicado em duas caixas diferentes — gmailId diferente em cada uma, então vira
// dois MeetRecap distintos pro mesmo encontro, com sugestões de tarefa divergentes.
// null/sem linha = sincroniza de todas as contas conectadas (comportamento histórico).
export async function getMeetRecapGmailUserId(squadId: string): Promise<string | null> {
  const row = await prisma.setting.findUnique({ where: { squadId_key: { squadId, key: MEET_RECAP_GMAIL_USER_KEY } } });
  return row?.value || null;
}

export async function setMeetRecapGmailUserId(squadId: string, userId: string | null): Promise<void> {
  if (!userId) {
    await prisma.setting.deleteMany({ where: { squadId, key: MEET_RECAP_GMAIL_USER_KEY } });
    return;
  }
  await prisma.setting.upsert({
    where: { squadId_key: { squadId, key: MEET_RECAP_GMAIL_USER_KEY } },
    update: { value: userId },
    create: { squadId, key: MEET_RECAP_GMAIL_USER_KEY, value: userId },
  });
}

// Secret do webhook n8n (POST /api/webhooks/n8n) — cada squad tem o seu, gerado por
// nós (não é colado pelo usuário como o token do Slack). A rota do webhook resolve
// QUAL squad recebeu a chamada olhando pra que squad esse valor pertence — não tem
// squadId na URL, então trocar o secret é a única forma de "desconectar" um n8n.
export async function getOrCreateN8nWebhookSecret(squadId: string): Promise<string> {
  const row = await prisma.setting.findUnique({ where: { squadId_key: { squadId, key: N8N_WEBHOOK_SECRET_KEY } } });
  if (row) return row.value;
  const secret = crypto.randomBytes(24).toString("hex");
  await prisma.setting.create({ data: { squadId, key: N8N_WEBHOOK_SECRET_KEY, value: secret } });
  return secret;
}

export async function regenerateN8nWebhookSecret(squadId: string): Promise<string> {
  const secret = crypto.randomBytes(24).toString("hex");
  await prisma.setting.upsert({
    where: { squadId_key: { squadId, key: N8N_WEBHOOK_SECRET_KEY } },
    update: { value: secret },
    create: { squadId, key: N8N_WEBHOOK_SECRET_KEY, value: secret },
  });
  return secret;
}

// Único lookup do webhook n8n que roda ANTES de saber o squad — por isso não usa
// forSquad/sessão, é o próprio secret que aponta pro squad dono dele.
export async function resolveSquadIdByN8nSecret(secret: string): Promise<string | null> {
  if (!secret) return null;
  const row = await prisma.setting.findFirst({ where: { key: N8N_WEBHOOK_SECRET_KEY, value: secret } });
  return row?.squadId ?? null;
}

// Dono da caixa de Gmail onde nasce o rascunho (nunca enviado) de cobrança de
// tarefa do cliente vencida — ver src/lib/gmail-draft.ts. null/sem linha = recurso
// desligado pro squad (não dá pra adivinhar um dono, diferente do Meet Recap Gmail
// que tem um default razoável de "todas as contas").
export async function getBillingDraftOwnerUserId(squadId: string): Promise<string | null> {
  const row = await prisma.setting.findUnique({ where: { squadId_key: { squadId, key: BILLING_DRAFT_OWNER_KEY } } });
  return row?.value || null;
}

export async function setBillingDraftOwnerUserId(squadId: string, userId: string | null): Promise<void> {
  if (!userId) {
    await prisma.setting.deleteMany({ where: { squadId, key: BILLING_DRAFT_OWNER_KEY } });
    return;
  }
  await prisma.setting.upsert({
    where: { squadId_key: { squadId, key: BILLING_DRAFT_OWNER_KEY } },
    update: { value: userId },
    create: { squadId, key: BILLING_DRAFT_OWNER_KEY, value: userId },
  });
}

// Liga/desliga cada tipo de notificação do Slack, por tipo (squad todo, não por pessoa —
// esse app não tem preferência individual, só um interruptor geral por tipo de aviso).
// Guardado num JSON só (em vez de uma Setting por tipo) pra dar pra adicionar tipo novo
// sem precisar de função nova. O default de cada tipo reflete o comportamento de hoje,
// antes desse painel existir — ligar o painel não muda nada até alguém mexer.
export const NOTIFICATION_TYPES = [
  "taskAssigned",
  "taskCompleted",
  "taskReminder",
  "commentMention",
  "tratativaOverdue",
  "onboardingDelay",
  "fechamentoIncomplete",
  "staleRecapSuggestions",
  "weeklyDigest",
  "meetingBriefing",
] as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

const NOTIFICATION_PREFS_KEY = "notification_slack_prefs";

const DEFAULT_NOTIFICATION_PREFS: Record<NotificationType, boolean> = {
  taskAssigned: true,
  taskCompleted: true,
  taskReminder: true,
  commentMention: true,
  tratativaOverdue: true,
  onboardingDelay: false, // já era só in-app antes desse painel existir
  fechamentoIncomplete: false, // desligado a pedido do usuário em 2026-07-30
  staleRecapSuggestions: false, // já era só in-app antes desse painel existir
  weeklyDigest: true,
  meetingBriefing: true,
};

export async function getNotificationPrefs(squadId: string): Promise<Record<NotificationType, boolean>> {
  const row = await prisma.setting.findUnique({ where: { squadId_key: { squadId, key: NOTIFICATION_PREFS_KEY } } });
  if (!row) return { ...DEFAULT_NOTIFICATION_PREFS };
  try {
    const stored = JSON.parse(row.value) as Partial<Record<NotificationType, boolean>>;
    return { ...DEFAULT_NOTIFICATION_PREFS, ...stored };
  } catch {
    return { ...DEFAULT_NOTIFICATION_PREFS };
  }
}

export async function isNotificationEnabled(squadId: string, type: NotificationType): Promise<boolean> {
  const prefs = await getNotificationPrefs(squadId);
  return prefs[type];
}

export async function setNotificationPref(squadId: string, type: NotificationType, enabled: boolean): Promise<Record<NotificationType, boolean>> {
  const prefs = await getNotificationPrefs(squadId);
  prefs[type] = enabled;
  await prisma.setting.upsert({
    where: { squadId_key: { squadId, key: NOTIFICATION_PREFS_KEY } },
    update: { value: JSON.stringify(prefs) },
    create: { squadId, key: NOTIFICATION_PREFS_KEY, value: JSON.stringify(prefs) },
  });
  return prefs;
}
