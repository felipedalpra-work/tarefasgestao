import { google } from "googleapis";
import { prisma } from "./prisma";
import { getBillingDraftOwnerUserId } from "./settings";
import { log } from "./logger";

// Substitui o Resend aqui (sem domínio verificado em resend.com/domains, ele recusa todo
// envio que não seja pro próprio dono da conta — achado real a partir do erro do backup
// diário) — passa a mandar pelo Gmail de quem o squad configurou como dono da minuta de
// cobrança (Configurações), mesma conexão já usada por src/lib/gmail-draft.ts.
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

// quebra em linhas de 76 colunas (RFC 2045) — alguns parsers de e-mail são exigentes com
// isso pra base64 de corpo de mensagem, diferente do "raw" da API do Gmail (esse sim
// precisa ser base64url sem quebra, ver toBase64Url acima)
function wrapBase64(value: string): string {
  return value.replace(/.{76}/g, "$&\r\n");
}

// Conta Google usada pra mandar e-mail "de sistema". Sem dono configurado pro squad, ou com
// a conta desconectada, cai pra QUALQUER conta Google conectada na plataforma — evita que
// um alerta cross-squad (pros owners, não importa qual squad falhou) fique sem remetente só
// porque aquele squad específico não tem dono configurado.
async function resolveSystemSenderAccount(squadId: string) {
  const ownerId = await getBillingDraftOwnerUserId(squadId);
  if (ownerId) {
    const account = await prisma.account.findFirst({ where: { userId: ownerId, provider: "google" } });
    if (account?.access_token) return account;
  }
  return prisma.account.findFirst({ where: { provider: "google", access_token: { not: null } } });
}

// Lança em caso de erro (mesmo contrato do antigo sendEmailOrThrow) — quem chama já
// trata/loga isso.
export async function sendSystemEmail({
  squadId,
  to,
  subject,
  html,
  attachments,
}: {
  squadId: string;
  to: string | string[];
  subject: string;
  html: string;
  attachments?: { filename: string; content: Buffer; contentType: string }[];
}): Promise<void> {
  const account = await resolveSystemSenderAccount(squadId);
  if (!account?.access_token) {
    throw new Error("Nenhuma conta Google conectada disponível pra enviar e-mail de sistema — configure o dono da minuta em Configurações.");
  }

  const oauth2 = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET);
  oauth2.setCredentials({
    access_token: account.access_token,
    refresh_token: account.refresh_token ?? undefined,
  });

  const gmail = google.gmail({ version: "v1", auth: oauth2 });
  const toList = Array.isArray(to) ? to : [to];

  const headers = [`To: ${toList.join(", ")}`, `Subject: ${encodeSubject(subject)}`, "MIME-Version: 1.0"];

  let mime: string;
  if (!attachments || attachments.length === 0) {
    mime = [...headers, `Content-Type: text/html; charset="UTF-8"`, "", html].join("\r\n");
  } else {
    const boundary = `boundary_${Buffer.from(String(Math.random())).toString("hex").slice(0, 16)}`;
    const parts = [
      `--${boundary}`,
      `Content-Type: text/html; charset="UTF-8"`,
      "",
      html,
      ...attachments.flatMap((a) => [
        `--${boundary}`,
        `Content-Type: ${a.contentType}; name="${a.filename}"`,
        `Content-Disposition: attachment; filename="${a.filename}"`,
        "Content-Transfer-Encoding: base64",
        "",
        wrapBase64(a.content.toString("base64")),
      ]),
      `--${boundary}--`,
    ];
    mime = [...headers, `Content-Type: multipart/mixed; boundary="${boundary}"`, "", ...parts].join("\r\n");
  }

  await gmail.users.messages.send({ userId: "me", requestBody: { raw: toBase64Url(mime) } });
  await log("system-email", `E-mail enviado para ${toList.join(", ")}: "${subject}"`);
}

function baseTemplate(content: string) {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>O2 Squad</title>
</head>
<body style="margin:0;padding:0;background-color:#0f0f0f;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#0f0f0f;padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;">

          <!-- Header -->
          <tr>
            <td style="padding-bottom:28px;">
              <table cellpadding="0" cellspacing="0">
                <tr>
                  <td style="padding-right:10px;vertical-align:middle;">
                    <svg width="30" height="30" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
                      <circle cx="50" cy="50" r="45" stroke="#6BF169" stroke-width="9" fill="none" />
                      <circle cx="50" cy="50" r="25" stroke="#6BF169" stroke-width="9" fill="none" />
                    </svg>
                  </td>
                  <td style="vertical-align:middle;">
                    <table cellpadding="0" cellspacing="0">
                      <tr>
                        <td>
                          <span style="font-size:30px;font-weight:900;color:#6BF169;letter-spacing:-1px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">O2</span>
                          <span style="font-size:11px;color:#666666;text-transform:uppercase;letter-spacing:4px;margin-left:8px;vertical-align:middle;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">Squad</span>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding-top:2px;">
                          <span style="font-size:11px;color:#444444;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">gestão fluída.</span>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Card -->
          <tr>
            <td style="background-color:#1a1a1a;border-radius:16px;border:1px solid #2a2a2a;padding:32px;">
              ${content}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding-top:24px;text-align:center;">
              <span style="font-size:11px;color:#333333;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">O2 Squad Tasks &nbsp;·&nbsp; Sistema interno do squad</span>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export async function sendNewTaskEmail({
  squadId,
  to,
  assigneeName,
  taskTitle,
  taskDescription,
  priority,
  dueDate,
  createdBy,
}: {
  squadId: string;
  to: string;
  assigneeName: string;
  taskTitle: string;
  taskDescription?: string | null;
  priority: string;
  dueDate?: Date | null;
  createdBy: string;
}) {
  const priorityColor = priority === "high" ? "#f87171" : priority === "medium" ? "#fbbf24" : "#6BF169";
  const priorityLabel = priority === "high" ? "Alta" : priority === "medium" ? "Média" : "Baixa";
  const priorityBg = priority === "high" ? "#2d1a1a" : priority === "medium" ? "#2d2510" : "#1a2d1a";
  const dueDateStr = dueDate
    ? new Date(dueDate).toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" })
    : null;

  const html = baseTemplate(`
    <!-- Title -->
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
      <tr>
        <td>
          <div style="width:36px;height:36px;background-color:#6BF16920;border-radius:8px;display:inline-block;text-align:center;line-height:36px;margin-bottom:16px;">
            <span style="font-size:18px;">✓</span>
          </div>
          <h1 style="margin:0 0 6px;font-size:20px;font-weight:700;color:#f0f0f0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">Nova tarefa atribuída</h1>
          <p style="margin:0;font-size:14px;color:#888888;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">Olá <strong style="color:#cccccc;">${assigneeName}</strong>, você recebeu uma nova tarefa.</p>
        </td>
      </tr>
    </table>

    <!-- Divider -->
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
      <tr><td style="height:1px;background-color:#2a2a2a;"></td></tr>
    </table>

    <!-- Task card -->
    <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#222222;border-radius:12px;margin-bottom:24px;">
      <tr>
        <td style="padding:20px;">
          <p style="margin:0 0 10px;font-size:16px;font-weight:600;color:#f0f0f0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">${taskTitle}</p>
          ${taskDescription ? `<p style="margin:0 0 16px;font-size:13px;color:#999999;line-height:1.6;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">${taskDescription}</p>` : ""}
          <table cellpadding="0" cellspacing="0">
            <tr>
              <td style="padding-right:8px;">
                <span style="display:inline-block;background-color:${priorityBg};color:${priorityColor};font-size:11px;font-weight:700;padding:4px 12px;border-radius:20px;text-transform:uppercase;letter-spacing:0.5px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">● ${priorityLabel}</span>
              </td>
              ${dueDateStr ? `<td><span style="display:inline-block;background-color:#222222;color:#888888;font-size:12px;padding:4px 12px;border-radius:20px;border:1px solid #333333;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">📅 ${dueDateStr}</span></td>` : ""}
            </tr>
          </table>
        </td>
      </tr>
    </table>

    <!-- Assigned by -->
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td style="background-color:#161616;border-radius:8px;padding:12px 16px;">
          <p style="margin:0;font-size:12px;color:#666666;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
            Atribuída por <strong style="color:#888888;">${createdBy}</strong>
          </p>
        </td>
      </tr>
    </table>
  `);

  return sendSystemEmail({ squadId, to, subject: `[O2 Squad] Nova tarefa: ${taskTitle}`, html });
}

export async function sendDeadlineAlertEmail({
  squadId,
  to,
  assigneeName,
  taskTitle,
  dueDate,
  daysLeft,
}: {
  squadId: string;
  to: string;
  assigneeName: string;
  taskTitle: string;
  dueDate: Date;
  daysLeft: number;
}) {
  const dueDateStr = new Date(dueDate).toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
  const isOverdue = daysLeft < 0;
  const isToday = daysLeft === 0;

  const urgencyColor = isOverdue ? "#f87171" : isToday ? "#fbbf24" : "#fb923c";
  const urgencyBg = isOverdue ? "#2d1a1a" : isToday ? "#2d2510" : "#2d1f0f";
  const urgencyIcon = isOverdue ? "⚠️" : "⏰";
  const urgencyTitle = isOverdue ? "Tarefa em atraso" : "Prazo se aproximando";
  const urgencyText = isOverdue
    ? `Esta tarefa está em atraso há <strong style="color:${urgencyColor};">${Math.abs(daysLeft)} dia(s)</strong>.`
    : isToday
    ? `Esta tarefa <strong style="color:${urgencyColor};">vence hoje</strong>.`
    : `Esta tarefa vence em <strong style="color:${urgencyColor};">${daysLeft} dia(s)</strong>.`;

  const html = baseTemplate(`
    <!-- Title -->
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
      <tr>
        <td>
          <div style="width:36px;height:36px;background-color:${urgencyBg};border-radius:8px;display:inline-block;text-align:center;line-height:36px;margin-bottom:16px;">
            <span style="font-size:18px;">${urgencyIcon}</span>
          </div>
          <h1 style="margin:0 0 6px;font-size:20px;font-weight:700;color:#f0f0f0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">${urgencyTitle}</h1>
          <p style="margin:0;font-size:14px;color:#888888;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">Olá <strong style="color:#cccccc;">${assigneeName}</strong>, atenção ao prazo desta tarefa.</p>
        </td>
      </tr>
    </table>

    <!-- Divider -->
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
      <tr><td style="height:1px;background-color:#2a2a2a;"></td></tr>
    </table>

    <!-- Task card -->
    <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#222222;border:1px solid ${urgencyColor}30;border-radius:12px;margin-bottom:24px;">
      <tr>
        <td style="padding:20px;">
          <p style="margin:0 0 14px;font-size:16px;font-weight:600;color:#f0f0f0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">${taskTitle}</p>
          <table cellpadding="0" cellspacing="0">
            <tr>
              <td>
                <span style="display:inline-block;background-color:${urgencyBg};color:${urgencyColor};font-size:12px;font-weight:600;padding:5px 14px;border-radius:20px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
                  📅 ${dueDateStr}
                </span>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>

    <!-- Message -->
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td style="background-color:#161616;border-radius:8px;padding:14px 16px;">
          <p style="margin:0;font-size:13px;color:#888888;line-height:1.6;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
            ${urgencyText} Acesse o sistema e atualize o status da tarefa.
          </p>
        </td>
      </tr>
    </table>
  `);

  return sendSystemEmail({ squadId, to, subject: `[O2 Squad] ${urgencyTitle}: ${taskTitle}`, html });
}

export async function sendDailyBackupEmail({
  squadId,
  to,
  squadName,
  dateStr,
  summary,
  attachment,
  filename,
}: {
  squadId: string;
  to: string[];
  squadName: string;
  dateStr: string;
  summary: { label: string; value: string | number }[];
  attachment: Buffer;
  filename: string;
}) {
  const html = baseTemplate(`
    <!-- Title -->
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
      <tr>
        <td>
          <div style="width:36px;height:36px;background-color:#1a2d1a;border-radius:8px;display:inline-block;text-align:center;line-height:36px;margin-bottom:16px;">
            <span style="font-size:18px;">💾</span>
          </div>
          <h1 style="margin:0 0 6px;font-size:20px;font-weight:700;color:#f0f0f0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">Backup diário — ${squadName}</h1>
          <p style="margin:0;font-size:14px;color:#888888;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">Planilha com todos os dados do squad em ${dateStr}, em anexo.</p>
        </td>
      </tr>
    </table>

    <!-- Divider -->
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
      <tr><td style="height:1px;background-color:#2a2a2a;"></td></tr>
    </table>

    <!-- Resumo -->
    <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#222222;border-radius:12px;margin-bottom:24px;">
      <tr>
        <td style="padding:20px;">
          ${summary
            .map(
              (s) =>
                `<p style="margin:0 0 8px;font-size:13px;color:#999999;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">${s.label}: <strong style="color:#e0e0e0;">${s.value}</strong></p>`
            )
            .join("")}
        </td>
      </tr>
    </table>

    <!-- Message -->
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td style="background-color:#161616;border-radius:8px;padding:14px 16px;">
          <p style="margin:0;font-size:12px;color:#666666;line-height:1.6;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
            Guarde este e-mail — é a cópia de segurança independente da plataforma. Enviado automaticamente todo dia, sem precisar pedir.
          </p>
        </td>
      </tr>
    </table>
  `);

  return sendSystemEmail({
    squadId,
    to,
    subject: `[O2 Squad] Backup diário — ${squadName} — ${dateStr}`,
    html,
    attachments: [{ filename, content: attachment, contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }],
  });
}

// Alerta pros owners da plataforma (cross-squad) quando um job crítico falha de
// verdade — hoje só o backup diário usa isso (src/lib/backup-email.ts). Vai por
// e-mail (não Slack) de propósito: Slack é configurado por squad (bot token
// próprio), e esse alerta precisa alcançar os owners não importa qual squad falhou.
export async function sendJobFailureAlertEmail({
  squadId,
  to,
  jobName,
  squadName,
  errorDetail,
}: {
  squadId: string;
  to: string[];
  jobName: string;
  squadName: string;
  errorDetail: string;
}) {
  const html = baseTemplate(`
    <!-- Title -->
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
      <tr>
        <td>
          <div style="width:36px;height:36px;background-color:#2d1a1a;border-radius:8px;display:inline-block;text-align:center;line-height:36px;margin-bottom:16px;">
            <span style="font-size:18px;">🚨</span>
          </div>
          <h1 style="margin:0 0 6px;font-size:20px;font-weight:700;color:#f0f0f0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">Job "${jobName}" falhou</h1>
          <p style="margin:0;font-size:14px;color:#888888;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">Squad afetado: <strong style="color:#cccccc;">${squadName}</strong></p>
        </td>
      </tr>
    </table>

    <!-- Divider -->
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
      <tr><td style="height:1px;background-color:#2a2a2a;"></td></tr>
    </table>

    <!-- Erro -->
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td style="background-color:#161616;border-radius:8px;padding:14px 16px;">
          <p style="margin:0;font-size:12px;color:#888888;font-family:monospace;word-break:break-all;line-height:1.6;">${errorDetail.slice(0, 1500)}</p>
        </td>
      </tr>
    </table>
  `);

  return sendSystemEmail({
    squadId,
    to,
    subject: `[O2 Squad] ⚠️ Job "${jobName}" falhou — ${squadName}`,
    html,
  });
}

export async function sendPasswordResetEmail({
  squadId,
  to,
  name,
  resetUrl,
}: {
  squadId: string;
  to: string;
  name?: string | null;
  resetUrl: string;
}) {
  const html = baseTemplate(`
    <!-- Title -->
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
      <tr>
        <td>
          <div style="width:36px;height:36px;background-color:#6BF16920;border-radius:8px;display:inline-block;text-align:center;line-height:36px;margin-bottom:16px;">
            <span style="font-size:18px;">🔑</span>
          </div>
          <h1 style="margin:0 0 6px;font-size:20px;font-weight:700;color:#f0f0f0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">Redefinir senha</h1>
          <p style="margin:0;font-size:14px;color:#888888;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">Olá${name ? ` <strong style="color:#cccccc;">${name}</strong>` : ""}, recebemos um pedido para redefinir sua senha.</p>
        </td>
      </tr>
    </table>

    <!-- Divider -->
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
      <tr><td style="height:1px;background-color:#2a2a2a;"></td></tr>
    </table>

    <!-- CTA -->
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
      <tr>
        <td align="center">
          <a href="${resetUrl}" style="display:inline-block;background-color:#6BF169;color:#111111;font-weight:700;font-size:14px;padding:12px 28px;border-radius:12px;text-decoration:none;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">Criar nova senha</a>
        </td>
      </tr>
    </table>

    <!-- Message -->
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td style="background-color:#161616;border-radius:8px;padding:14px 16px;">
          <p style="margin:0;font-size:13px;color:#888888;line-height:1.6;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
            Este link expira em 1 hora. Se você não pediu essa redefinição, ignore este email — sua senha continua a mesma.
          </p>
        </td>
      </tr>
    </table>
  `);

  return sendSystemEmail({ squadId, to, subject: "[O2 Squad] Redefinição de senha", html });
}

// Monta (sem enviar) o conteúdo de um e-mail de cobrança de pendência do cliente —
// escrito como se fosse endereçado a ele, pra virar rascunho no Gmail de alguém do
// squad revisar/completar destinatário antes de mandar. Ver src/lib/gmail-draft.ts.
export function buildClientTaskDraftHtml({
  client,
  taskTitle,
  taskDescription,
  dueDate,
  meetingTitle,
  meetingDate,
}: {
  client: string;
  taskTitle: string;
  taskDescription?: string | null;
  dueDate: Date;
  meetingTitle?: string | null;
  meetingDate?: Date | null;
}) {
  const dueDateStr = new Date(dueDate).toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
  const meetingDateStr = meetingDate
    ? new Date(meetingDate).toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" })
    : null;

  const html = baseTemplate(`
    <!-- Title -->
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
      <tr>
        <td>
          <div style="width:36px;height:36px;background-color:#2d1a1a;border-radius:8px;display:inline-block;text-align:center;line-height:36px;margin-bottom:16px;">
            <span style="font-size:18px;">⚠️</span>
          </div>
          <h1 style="margin:0 0 6px;font-size:20px;font-weight:700;color:#f0f0f0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">Rascunho: cobrança de pendência</h1>
          <p style="margin:0;font-size:13px;color:#666666;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">Rascunho gerado automaticamente — revise, preencha o destinatário e edite como quiser antes de enviar.</p>
        </td>
      </tr>
    </table>

    <!-- Divider -->
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
      <tr><td style="height:1px;background-color:#2a2a2a;"></td></tr>
    </table>

    <!-- Mensagem pro cliente -->
    <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#222222;border-radius:12px;margin-bottom:24px;">
      <tr>
        <td style="padding:20px;">
          <p style="margin:0 0 14px;font-size:14px;color:#e0e0e0;line-height:1.7;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">Olá, tudo bem?</p>
          <p style="margin:0 0 14px;font-size:14px;color:#e0e0e0;line-height:1.7;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
            Passando para dar continuidade à pendência <strong style="color:#f0f0f0;">"${taskTitle}"</strong>${meetingTitle ? `, tratada na nossa reunião${meetingDateStr ? ` do dia ${meetingDateStr}` : ""} ("${meetingTitle}")` : ""}.
          </p>
          ${taskDescription ? `<p style="margin:0 0 14px;font-size:14px;color:#e0e0e0;line-height:1.7;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">${taskDescription}</p>` : ""}
          <p style="margin:0 0 14px;font-size:14px;color:#e0e0e0;line-height:1.7;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
            O prazo combinado era <strong style="color:#f87171;">${dueDateStr}</strong> — poderia nos dar um retorno sobre o andamento?
          </p>
          <p style="margin:0;font-size:14px;color:#e0e0e0;line-height:1.7;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">Qualquer dúvida, estamos à disposição.</p>
        </td>
      </tr>
    </table>

    <!-- Contexto interno (não faz parte da mensagem ao cliente) -->
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td style="background-color:#161616;border-radius:8px;padding:12px 16px;">
          <p style="margin:0;font-size:12px;color:#666666;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
            Cliente: <strong style="color:#888888;">${client}</strong> · Tarefa vencida desde ${dueDateStr}
          </p>
        </td>
      </tr>
    </table>
  `);

  return { subject: `Follow-up: ${taskTitle}`, html };
}

// Modelo padrão do e-mail de pendências mandado pro cliente na aba "E-mail" da Revisão
// Semanal, usado quando o squad ainda não configurou o próprio em Configurações (ver
// getClientEmailTemplate/setClientEmailTemplate em settings.ts). O token {{tarefas}} vira a
// lista das tarefas marcadas (ver renderBody em revisao-semanal/page.tsx).
export const DEFAULT_CLIENT_EMAIL_TEMPLATE = `Olá, tudo bem?

Segue abaixo o resumo das pendências em aberto para acompanhamento:

{{tarefas}}

Qualquer dúvida, estamos à disposição.

Abraços,
Equipe O2`;

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Converte o texto puro já editado na tela (com {{tarefas}} já substituído por uma lista de
// linhas "• título — prazo: dd/mm/aaaa") num HTML limpo pra virar o corpo do e-mail de
// verdade — SEM o baseTemplate() (rodapé diz "Sistema interno do squad", errado pra algo que
// vai pro cliente) e sem o aviso de rascunho que buildClientTaskDraftHtml usa (aqui o texto já
// foi revisado na tela antes de disparar, não precisa de aviso dentro do próprio corpo).
export function buildWeeklyClientEmailHtml({ bodyText }: { bodyText: string }): string {
  const blocks = bodyText.split(/\n{2,}/).map((b) => b.trim()).filter(Boolean);

  const html = blocks
    .map((block) => {
      const lines = block.split("\n").map((l) => l.trim()).filter(Boolean);
      const isList = lines.every((l) => l.startsWith("• "));
      if (isList) {
        const items = lines.map((l) => `<li style="margin-bottom:6px;">${escapeHtml(l.slice(2))}</li>`).join("");
        return `<ul style="margin:0 0 16px;padding-left:20px;">${items}</ul>`;
      }
      return `<p style="margin:0 0 16px;">${lines.map(escapeHtml).join("<br/>")}</p>`;
    })
    .join("");

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
</head>
<body style="margin:0;padding:0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  <div style="max-width:560px;margin:0 auto;padding:16px;font-size:14px;line-height:1.7;color:#1a1a1a;">
    ${html}
  </div>
</body>
</html>`;
}
