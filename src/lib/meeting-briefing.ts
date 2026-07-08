import { prisma } from "./prisma";
import { Resend } from "resend";
import { getSlackConfig, sendSlackDM } from "./slack";
import { log } from "./logger";
import { getBaseUrl } from "./base-url";

let resend: Resend | null = null;
function getResend() {
  if (!resend) resend = new Resend(process.env.RESEND_API_KEY);
  return resend;
}
const FROM = process.env.RESEND_FROM || "onboarding@resend.dev";

function briefingTemplate(client: string, meetingDate: string, o2Tasks: any[], clientTasks: any[]) {
  const renderTask = (t: any) => `
    <tr>
      <td style="padding:10px 0;border-bottom:1px solid #222222;">
        <p style="margin:0 0 4px;font-size:14px;color:#f0f0f0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">${t.title}</p>
        ${t.description ? `<p style="margin:0;font-size:12px;color:#888888;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">${t.description}</p>` : ""}
        ${t.assignee?.name ? `<p style="margin:4px 0 0;font-size:11px;color:#6BF169;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">→ ${t.assignee.name}</p>` : ""}
      </td>
    </tr>`;

  const o2Section = o2Tasks.length > 0
    ? `<table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
        ${o2Tasks.map(renderTask).join("")}
       </table>`
    : `<p style="color:#555555;font-size:13px;font-style:italic;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">Nenhuma entrega pendente.</p>`;

  const clientSection = clientTasks.length > 0
    ? `<table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
        ${clientTasks.map(renderTask).join("")}
       </table>`
    : `<p style="color:#555555;font-size:13px;font-style:italic;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">Nenhuma entrega pendente do cliente.</p>`;

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/></head>
<body style="margin:0;padding:0;background-color:#0f0f0f;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#0f0f0f;padding:40px 16px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:540px;">

        <tr><td style="padding-bottom:28px;">
          <span style="font-size:30px;font-weight:900;color:#6BF169;letter-spacing:-1px;">O2</span>
          <span style="font-size:11px;color:#666666;text-transform:uppercase;letter-spacing:4px;margin-left:8px;vertical-align:middle;">Squad</span>
          <p style="color:#444444;font-size:11px;margin:2px 0 0;">gestão fluída.</p>
        </td></tr>

        <tr><td style="background-color:#1a1a1a;border-radius:16px;border:1px solid #2a2a2a;padding:32px;">

          <!-- Header -->
          <div style="background-color:#6BF16915;border:1px solid #6BF16930;border-radius:10px;padding:16px 20px;margin-bottom:28px;">
            <p style="margin:0 0 4px;font-size:12px;color:#6BF169;text-transform:uppercase;letter-spacing:1px;font-weight:700;">📅 Reunião amanhã</p>
            <p style="margin:0;font-size:20px;font-weight:700;color:#f0f0f0;">O2 Inc & ${client}</p>
            <p style="margin:4px 0 0;font-size:13px;color:#888888;">${meetingDate}</p>
          </div>

          <!-- O2 deliveries -->
          <h2 style="margin:0 0 12px;font-size:13px;font-weight:700;color:#f0f0f0;text-transform:uppercase;letter-spacing:1px;">
            ✅ O que a O2 precisa entregar
          </h2>
          ${o2Section}

          <!-- Client deliveries -->
          <h2 style="margin:24px 0 12px;font-size:13px;font-weight:700;color:#f0f0f0;text-transform:uppercase;letter-spacing:1px;">
            📥 O que ${client} precisa entregar
          </h2>
          ${clientSection}

          <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:24px;">
            <tr><td style="height:1px;background-color:#2a2a2a;"></td></tr>
          </table>
          <p style="margin:16px 0 0;font-size:12px;color:#555555;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
            Acesse o sistema para atualizar o status das tarefas antes da reunião.
          </p>

        </td></tr>
        <tr><td style="padding-top:24px;text-align:center;">
          <span style="font-size:11px;color:#333333;">O2 Squad Tasks · Briefing automático</span>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export async function sendMeetingBriefings(): Promise<void> {
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(0, 0, 0, 0);
  const dayAfter = new Date(tomorrow);
  dayAfter.setHours(23, 59, 59, 999);

  // busca reuniões de amanhã que ainda não tiveram briefing enviado
  const events = await prisma.calendarEvent.findMany({
    where: {
      startAt: { gte: tomorrow, lte: dayAfter },
      briefingSent: false,
    },
  });

  if (events.length === 0) return;
  console.log(`[briefing] ${events.length} reunião(ões) amanhã`);

  const users = await prisma.user.findMany({
    select: { id: true, name: true, email: true },
  });

  for (const event of events) {
    const client = event.client;

    // tarefas O2 para esse cliente (deliverTo = "client" ou source = meet_recap com esse cliente)
    const o2Tasks = await prisma.task.findMany({
      where: {
        status: { notIn: ["done"] },
        client: { equals: client },
        deliverTo: "client",
      },
      include: { assignee: { select: { name: true } } },
    });

    // tarefas que o cliente tem que entregar pra O2
    const clientTasks = await prisma.task.findMany({
      where: {
        status: { notIn: ["done"] },
        client: { equals: client },
        deliverTo: "o2",
      },
      include: { assignee: { select: { name: true } } },
    });

    const meetingDate = event.startAt.toLocaleDateString("pt-BR", {
      weekday: "long", day: "2-digit", month: "long", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });

    const html = briefingTemplate(client, meetingDate, o2Tasks, clientTasks);

    // envia para todos os membros do squad
    for (const user of users) {
      if (!user.email) continue;
      try {
        await getResend().emails.send({
          from: FROM,
          to: user.email,
          subject: `[O2 Squad] Reunião amanhã: O2 Inc & ${client}`,
          html,
        });
        await log("briefing", `Email de briefing enviado para ${user.email}`, {
          detail: `Reunião com ${client}`,
        });
        console.log(`[briefing] enviado para ${user.email} — reunião com ${client}`);
      } catch (err) {
        await log("briefing", `Erro ao enviar briefing para ${user.email}`, {
          level: "error",
          detail: String(err),
        });
        console.error(`[briefing] erro ao enviar para ${user.email}:`, err);
      }
    }

    // Slack briefing
    const slackConfig = await getSlackConfig();
    if (slackConfig) {
      const slackLines = [
        `📅 *Reunião amanhã: O2 Inc & ${client}*`,
        `🕐 ${meetingDate}`,
        "",
      ];
      if (o2Tasks.length > 0) {
        slackLines.push("*✅ O que a O2 precisa entregar:*");
        o2Tasks.slice(0, 5).forEach(t => slackLines.push(`• ${t.title}${t.assignee?.name ? ` _(${t.assignee.name})_` : ""}`));
        if (o2Tasks.length > 5) slackLines.push(`  _…e mais ${o2Tasks.length - 5}_`);
      } else {
        slackLines.push("*✅ O que a O2 precisa entregar:* _nenhuma entrega pendente_");
      }
      slackLines.push("");
      if (clientTasks.length > 0) {
        slackLines.push(`*📥 O que ${client} precisa entregar:*`);
        clientTasks.slice(0, 5).forEach(t => slackLines.push(`• ${t.title}`));
      } else {
        slackLines.push(`*📥 O que ${client} precisa entregar:* _nenhuma entrega pendente_`);
      }
      slackLines.push("", `<${getBaseUrl()}/clientes/${encodeURIComponent(client)}|Ver pasta do cliente →>`);

      const slackMsg = slackLines.join("\n");
      for (const slackUserId of Object.values(slackConfig.userMap)) {
        await sendSlackDM(slackUserId, slackConfig.botToken, slackMsg).catch(console.error);
      }
    }

    // marca briefing como enviado
    await prisma.calendarEvent.update({
      where: { id: event.id },
      data: { briefingSent: true },
    });
  }
}
