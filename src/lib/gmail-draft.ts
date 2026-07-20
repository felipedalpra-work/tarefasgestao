import { prisma } from "./prisma";
import { log } from "./logger";
import { buildClientTaskDraftHtml } from "./email";
import { google } from "googleapis";

// E-mail de quem recebe os rascunhos de cobrança de tarefa do cliente — fixo por
// enquanto (pedido explícito do usuário), não é um "responsável" configurável.
const DRAFT_OWNER_EMAIL = "felipe.dalpra@o2inc.com.br";

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

// Cria um RASCUNHO (nunca envia) no Gmail do dono fixo acima, com uma mensagem já
// redigida como se fosse pro cliente sobre uma tarefa vencida — fica com "Para" em
// branco de propósito (não temos e-mail de cliente cadastrado na plataforma), pra
// quem revisar completar o destinatário antes de mandar.
export async function createClientTaskDraft(task: ClientTask): Promise<boolean> {
  const owner = await prisma.user.findUnique({ where: { email: DRAFT_OWNER_EMAIL } });
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
