import { Resend } from "resend";

let resend: Resend | null = null;
function getResend() {
  if (!resend) resend = new Resend(process.env.RESEND_API_KEY);
  return resend;
}
const FROM = process.env.RESEND_FROM || "onboarding@resend.dev";

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
  to,
  assigneeName,
  taskTitle,
  taskDescription,
  priority,
  dueDate,
  createdBy,
}: {
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

  return getResend().emails.send({ from: FROM, to, subject: `[O2 Squad] Nova tarefa: ${taskTitle}`, html });
}

export async function sendDeadlineAlertEmail({
  to,
  assigneeName,
  taskTitle,
  dueDate,
  daysLeft,
}: {
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

  return getResend().emails.send({ from: FROM, to, subject: `[O2 Squad] ${urgencyTitle}: ${taskTitle}`, html });
}

export async function sendPasswordResetEmail({
  to,
  name,
  resetUrl,
}: {
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

  return getResend().emails.send({ from: FROM, to, subject: "[O2 Squad] Redefinição de senha", html });
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
