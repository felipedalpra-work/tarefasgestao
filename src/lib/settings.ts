import crypto from "crypto";
import { prisma } from "./prisma";
import { normalizeText } from "./utils";

const MEET_RECAP_SUGGESTIONS_KEY = "meet_recap_suggestions_enabled";
const MEET_RECAP_GMAIL_USER_KEY = "meet_recap_gmail_user_id";
const N8N_WEBHOOK_SECRET_KEY = "n8n_webhook_secret";
const BILLING_DRAFT_OWNER_KEY = "billing_draft_owner_user_id";
const TEMPERATURE_PROMPT_KEY = "pipefy_temperature_prompt";
const TEMPERATURE_PROMPT_DISMISSED_KEY = "pipefy_temperature_prompt_dismissed";
const CLIENT_EMAIL_TEMPLATE_KEY = "weekly_client_email_template";
const SYSTEM_EMAIL_SENDER_KEY = "system_email_sender_user_id";

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
// nós (não é colado pelo usuário). A rota do webhook resolve
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

// Critério (prompt livre) que o CFO define pra IA avaliar Temperatura/Próximos Passos a
// partir da transcrição de uma reunião — ver src/lib/temperature-suggestion.ts. null/sem
// linha = ninguém configurou ainda; quem usa cai no DEFAULT_TEMPERATURE_PROMPT de lá.
export async function getTemperaturePrompt(squadId: string): Promise<string | null> {
  const row = await prisma.setting.findUnique({ where: { squadId_key: { squadId, key: TEMPERATURE_PROMPT_KEY } } });
  return row?.value || null;
}

export async function setTemperaturePrompt(squadId: string, prompt: string): Promise<void> {
  await prisma.setting.upsert({
    where: { squadId_key: { squadId, key: TEMPERATURE_PROMPT_KEY } },
    update: { value: prompt },
    create: { squadId, key: TEMPERATURE_PROMPT_KEY, value: prompt },
  });
}

// Marca que o popup de primeira configuração já apareceu pra um admin e foi fechado sem
// preencher ("Agora não") — não insiste de novo, mas o campo continua em Configurações.
export async function isTemperaturePromptDismissed(squadId: string): Promise<boolean> {
  const row = await prisma.setting.findUnique({ where: { squadId_key: { squadId, key: TEMPERATURE_PROMPT_DISMISSED_KEY } } });
  return row?.value === "true";
}

export async function dismissTemperaturePrompt(squadId: string): Promise<void> {
  await prisma.setting.upsert({
    where: { squadId_key: { squadId, key: TEMPERATURE_PROMPT_DISMISSED_KEY } },
    update: { value: "true" },
    create: { squadId, key: TEMPERATURE_PROMPT_DISMISSED_KEY, value: "true" },
  });
}

// Modelo padrão do corpo do e-mail de pendências mandado pro cliente na Revisão Semanal
// (ver src/lib/email.ts e a aba "E-mail" de src/app/(app)/revisao-semanal/page.tsx). null/sem
// linha = ninguém configurou ainda; quem usa cai no DEFAULT_CLIENT_EMAIL_TEMPLATE de lá.
export async function getClientEmailTemplate(squadId: string): Promise<string | null> {
  const row = await prisma.setting.findUnique({ where: { squadId_key: { squadId, key: CLIENT_EMAIL_TEMPLATE_KEY } } });
  return row?.value || null;
}

export async function setClientEmailTemplate(squadId: string, template: string): Promise<void> {
  await prisma.setting.upsert({
    where: { squadId_key: { squadId, key: CLIENT_EMAIL_TEMPLATE_KEY } },
    update: { value: template },
    create: { squadId, key: CLIENT_EMAIL_TEMPLATE_KEY, value: template },
  });
}

// Quem manda os e-mails "de sistema" (tarefa nova, alerta de prazo, backup, erro de job) —
// ver resolveSystemSenderAccount em src/lib/email.ts. Separado do dono da minuta de
// cobrança (billing draft, acima): esse aqui é sobre QUEM assina o e-mail que sai pro
// squad inteiro, aquele é sobre o rascunho de cobrança pro cliente — são recursos
// diferentes mesmo reaproveitando a mesma conta Google por padrão hoje. Pensado também
// pra já poder apontar pra um e-mail corporativo só da plataforma assim que esse usuário
// existir e conectar o Google — sem precisar de código novo quando esse dia chegar.
// null/sem linha = cai no fallback de resolveSystemSenderAccount (dono da minuta, depois
// qualquer conta conectada).
export async function getSystemEmailSenderUserId(squadId: string): Promise<string | null> {
  const row = await prisma.setting.findUnique({ where: { squadId_key: { squadId, key: SYSTEM_EMAIL_SENDER_KEY } } });
  return row?.value || null;
}

export async function setSystemEmailSenderUserId(squadId: string, userId: string | null): Promise<void> {
  if (!userId) {
    await prisma.setting.deleteMany({ where: { squadId, key: SYSTEM_EMAIL_SENDER_KEY } });
    return;
  }
  await prisma.setting.upsert({
    where: { squadId_key: { squadId, key: SYSTEM_EMAIL_SENDER_KEY } },
    update: { value: userId },
    create: { squadId, key: SYSTEM_EMAIL_SENDER_KEY, value: userId },
  });
}

// Empresas que aparecem na agenda de alguém do squad mas NÃO são da carteira.
// "Cliente" não é entidade própria, é uma string — e uma das fontes dela é o Google
// Calendar: todo evento "O2 Inc & <Nome> | ..." na agenda de quem conectou a conta vira
// CalendarEvent e faz <Nome> aparecer como cliente na carteira. Sem essa lista, excluir
// o cliente não resolve nada: o próximo sync (cron a cada poucos minutos) traz de volta.
// Guardado como JSON num Setting só (mesmo motivo das prefs de notificação: dá pra
// crescer sem função nova), na grafia original — a comparação é por normalizeText, então
// "StartGov", "startgov" e "Start Gov" contam como o mesmo nome.
const IGNORED_CLIENTS_KEY = "ignored_clients";

export async function getIgnoredClients(squadId: string): Promise<string[]> {
  const row = await prisma.setting.findUnique({ where: { squadId_key: { squadId, key: IGNORED_CLIENTS_KEY } } });
  if (!row) return [];
  try {
    const parsed: unknown = JSON.parse(row.value);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((n): n is string => typeof n === "string" && n.trim() !== "");
  } catch {
    return [];
  }
}

export function matchesIgnoredClient(ignored: string[], client: string | null | undefined): boolean {
  if (!client) return false;
  const target = normalizeText(client);
  return ignored.some((name) => normalizeText(name) === target);
}

export async function isClientIgnored(squadId: string, client: string): Promise<boolean> {
  return matchesIgnoredClient(await getIgnoredClients(squadId), client);
}

async function saveIgnoredClients(squadId: string, names: string[]): Promise<string[]> {
  const sorted = [...names].sort((a, b) => a.localeCompare(b));
  await prisma.setting.upsert({
    where: { squadId_key: { squadId, key: IGNORED_CLIENTS_KEY } },
    update: { value: JSON.stringify(sorted) },
    create: { squadId, key: IGNORED_CLIENTS_KEY, value: JSON.stringify(sorted) },
  });
  return sorted;
}

export async function addIgnoredClient(squadId: string, client: string): Promise<string[]> {
  const name = client.trim();
  if (!name) return getIgnoredClients(squadId);
  const current = await getIgnoredClients(squadId);
  if (matchesIgnoredClient(current, name)) return current;
  return saveIgnoredClients(squadId, [...current, name]);
}

export async function removeIgnoredClient(squadId: string, client: string): Promise<string[]> {
  const current = await getIgnoredClients(squadId);
  const kept = current.filter((name) => !matchesIgnoredClient([name], client));
  if (kept.length === current.length) return current;
  return saveIgnoredClients(squadId, kept);
}

// Liga/desliga cada gatilho de e-mail por PESSOA — não por squad. Cada um decide se
// quer receber ou não, guardado direto no User (não é um Setting, que é squadId+key —
// isso aqui é userId). Backup diário fica de fora de propósito (pedido explícito do
// usuário: é a cópia de segurança, continua obrigatório pra todo admin) e redefinição
// de senha também (quem recebe foi quem pediu o reset agora mesmo — desligar isso só
// trancaria a própria conta, sem reduzir ruído nenhum). sem linha = tudo ligado
// (default, igual já era antes desse painel existir).
export const EMAIL_TYPES = ["taskAssigned", "taskDeadline", "jobFailureAlert"] as const;
export type EmailType = (typeof EMAIL_TYPES)[number];

const DEFAULT_EMAIL_PREFS: Record<EmailType, boolean> = {
  taskAssigned: true,
  taskDeadline: true,
  jobFailureAlert: true,
};

export async function getEmailPrefs(userId: string): Promise<Record<EmailType, boolean>> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { emailPrefs: true } });
  const stored = (user?.emailPrefs as Partial<Record<EmailType, boolean>> | null) ?? null;
  return { ...DEFAULT_EMAIL_PREFS, ...stored };
}

export async function isEmailEnabled(userId: string, type: EmailType): Promise<boolean> {
  const prefs = await getEmailPrefs(userId);
  return prefs[type];
}

export async function setEmailPref(userId: string, type: EmailType, enabled: boolean): Promise<Record<EmailType, boolean>> {
  const prefs = await getEmailPrefs(userId);
  prefs[type] = enabled;
  await prisma.user.update({ where: { id: userId }, data: { emailPrefs: prefs } });
  return prefs;
}
