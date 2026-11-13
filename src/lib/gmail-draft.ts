import { prisma } from "./prisma";
import { log } from "./logger";
import { buildClientTaskDraftHtml, buildWeeklyClientEmailHtml } from "./email";
import { getBillingDraftOwnerUserId } from "./settings";
import { google } from "googleapis";

function encodeSubject(subject: string): string {
  return `=?UTF-8?B?${Buffer.from(subject, "utf-8").toString("base64")}?=`;
}

function toBase64Url(value: string): string {
  return Buffer.from(value, "utf-8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

type ClientTask = {
  title: string;
  description: string | null;
  client: string | null;
  dueDate: Date;
  meetingTitle: string | null;
  meetingDate: Date | null;
};

// Cria um RASCUNHO (nunca envia) no Gmail de quem o squad configurou como dono da
// minuta de cobrança (Configurações), com uma mensagem já redigida como se fosse
// pro cliente sobre uma tarefa vencida — fica com "Para" em branco de propósito
// (não temos e-mail de cliente cadastrado na plataforma), pra quem revisar
// completar o destinatário antes de mandar. Sem dono configurado = recurso
// desligado pro squad (não tem como adivinhar quem deveria receber).
export async function createClientTaskDraft(squadId: string, task: ClientTask): Promise<boolean> {
  const ownerId = await getBillingDraftOwnerUserId(squadId);
  if (!ownerId) return false;

  const owner = await prisma.user.findUnique({ where: { id: ownerId, squadId } });
  if (!owner) return false;

  const account = await prisma.account.findFirst({ where: { userId: owner.id, provider: "google" } });
  if (!account?.access_token) {
    await log("gmail-draft", "Rascunho não criado: conta Google não conectada", { level: "error" });
    return false;
  }

  try {
    const oauth2 = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET);
    oauth2.setCredentials({
      access_token: account.access_token,
      refresh_token: account.refresh_token ?? undefined,
    });

    const gmail = google.gmail({ version: "v1", auth: oauth2 });

    const { subject, html } = buildClientTaskDraftHtml({
      client: task.client || "Cliente não identificado",
      taskTitle: task.title,
      taskDescription: task.description,
      dueDate: task.dueDate,
      meetingTitle: task.meetingTitle,
      meetingDate: task.meetingDate,
    });

    const mime = [
      `Subject: ${encodeSubject(subject)}`,
      `Content-Type: text/html; charset="UTF-8"`,
      "MIME-Version: 1.0",
      "",
      html,
    ].join("\r\n");

    await gmail.users.drafts.create({
      userId: "me",
      requestBody: { message: { raw: toBase64Url(mime) } },
    });

    await log("gmail-draft", `Rascunho criado: "${task.title}" (${task.client || "sem cliente"})`);
    return true;
  } catch (err) {
    await log("gmail-draft", "Erro ao criar rascunho no Gmail", { level: "error", detail: String(err) });
    console.error("[gmail-draft] erro:", err);
    return false;
  }
}

// Envia DE VERDADE (não é rascunho) o e-mail de pendências da aba "E-mail" da Revisão
// Semanal — pelo Gmail de quem clicou em Enviar (não pelo dono fixo configurado em
// getBillingDraftOwnerUserId, que é só pro fluxo automático de cobrança de tarefa vencida).
// O escopo já concedido hoje (gmail.compose) cobre tanto rascunho quanto envio de verdade
// (users.messages.send), então não precisa de reconexão/consentimento novo. "De" fica a
// cargo do próprio Gmail — a API sempre envia como o endereço principal da conta
// autenticada, não dá pra falsificar.
export async function sendWeeklyClientEmail(
  userId: string,
  { clientEmails, ccEmails, subject, bodyText }: { clientEmails: string[]; ccEmails: string[]; subject: string; bodyText: string }
): Promise<{ ok: true } | { ok: false; error: string }> {
  const account = await prisma.account.findFirst({ where: { userId, provider: "google" } });
  if (!account?.access_token) {
    return { ok: false, error: "Conecte sua conta Google em Configurações antes de enviar." };
  }

  try {
    const oauth2 = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET);
    oauth2.setCredentials({
      access_token: account.access_token,
      refresh_token: account.refresh_token ?? undefined,
    });

    const gmail = google.gmail({ version: "v1", auth: oauth2 });

    const html = buildWeeklyClientEmailHtml({ bodyText });

    const mime = [
      `To: ${clientEmails.join(", ")}`,
      ...(ccEmails.length > 0 ? [`Cc: ${ccEmails.join(", ")}`] : []),
      `Subject: ${encodeSubject(subject)}`,
      `Content-Type: text/html; charset="UTF-8"`,
      "MIME-Version: 1.0",
      "",
      html,
    ].join("\r\n");

    await gmail.users.messages.send({
      userId: "me",
      requestBody: { raw: toBase64Url(mime) },
    });

    await log("weekly-email", `E-mail enviado para ${clientEmails.join(", ")} (cc: ${ccEmails.join(", ") || "ninguém"}): "${subject}"`);
    return { ok: true };
  } catch (err) {
    await log("weekly-email", "Erro ao enviar e-mail pro cliente", { level: "error", detail: String(err) });
    console.error("[weekly-email] erro:", err);
    return { ok: false, error: "Erro ao enviar pelo Gmail — confira se a conexão com o Google ainda é válida." };
  }
}
