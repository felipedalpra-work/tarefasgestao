import { prisma } from "./prisma";
import { log } from "./logger";
import { getBaseUrl } from "./base-url";

type SlackConfig = {
  botToken: string;
  userMap: Record<string, string>; // userId (DB) → slackUserId
};

export async function getSlackConfig(): Promise<SlackConfig | null> {
  const rows = await prisma.setting.findMany({
    where: { key: { startsWith: "slack_" } },
  });
  if (!rows.length) return null;

  const map: Record<string, string> = {};
  rows.forEach((r) => { map[r.key] = r.value; });

  const botToken = map["slack_bot_token"];
  if (!botToken) return null;

  const userMap: Record<string, string> = {};
  Object.entries(map).forEach(([k, v]) => {
    if (k.startsWith("slack_user_")) {
      const dbUserId = k.replace("slack_user_", "");
      userMap[dbUserId] = v;
    }
  });

  return { botToken, userMap };
}

export async function sendSlackDM(
  slackUserId: string,
  botToken: string,
  message: string
): Promise<boolean> {
  try {
    const res = await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        Authorization: `Bearer ${botToken}`,
      },
      body: JSON.stringify({ channel: slackUserId, text: message }),
    });
    const data = await res.json();
    if (!data.ok) {
      await log("slack", `Falha ao enviar DM para ${slackUserId}`, {
        level: "error",
        detail: data.error,
      });
      console.error("[slack] erro:", data.error);
      return false;
    }
    await log("slack", `DM enviada para ${slackUserId}`);
    return true;
  } catch (err) {
    await log("slack", "Erro na requisição ao Slack", { level: "error", detail: String(err) });
    console.error("[slack] falha na requisição:", err);
    return false;
  }
}

export async function notifyTaskAssigned({
  assigneeDbId,
  taskId,
  taskTitle,
  taskDescription,
  priority,
  dueDate,
  createdBy,
  client,
}: {
  assigneeDbId: string;
  taskId?: string;
  taskTitle: string;
  taskDescription?: string | null;
  priority: string;
  dueDate?: Date | null;
  createdBy?: string | null;
  client?: string | null;
}): Promise<void> {
  const config = await getSlackConfig();
  if (!config) return;

  const slackUserId = config.userMap[assigneeDbId];
  if (!slackUserId) return;

  const priorityEmoji: Record<string, string> = {
    high: "🔴",
    medium: "🟡",
    low: "🟢",
  };

  const lines: string[] = [
    `📋 *Nova tarefa atribuída a você*`,
    `*${taskTitle}*`,
  ];
  if (taskDescription) lines.push(taskDescription);
  lines.push("");
  lines.push(`${priorityEmoji[priority] ?? "⚪"} Prioridade: *${priority === "high" ? "Alta" : priority === "medium" ? "Média" : "Baixa"}*`);
  if (client) lines.push(`🏢 Cliente: *${client}*`);
  if (dueDate) lines.push(`📅 Prazo: *${new Date(dueDate).toLocaleDateString("pt-BR")}*`);
  if (createdBy) lines.push(`👤 Criado por: ${createdBy}`);
  const link = taskId ? `${getBaseUrl()}/tasks?task=${taskId}` : `${getBaseUrl()}/kanban`;
  lines.push("", `<${link}|Ver tarefa →>`);

  await sendSlackDM(slackUserId, config.botToken, lines.join("\n"));
}

// DM manual disparada pela pessoa que abriu a tarefa, cobrando o responsável (botão "Lembrar" no detalhe da tarefa)
export async function notifyTaskReminder({
  assigneeDbId,
  taskId,
  taskTitle,
  taskDescription,
  priority,
  dueDate,
  client,
  requestedBy,
}: {
  assigneeDbId: string;
  taskId?: string;
  taskTitle: string;
  taskDescription?: string | null;
  priority: string;
  dueDate?: Date | null;
  client?: string | null;
  requestedBy?: string | null;
}): Promise<{ ok: boolean; error?: string }> {
  const config = await getSlackConfig();
  if (!config) return { ok: false, error: "Integração com Slack não configurada (Configurações → Slack)" };

  const slackUserId = config.userMap[assigneeDbId];
  if (!slackUserId) return { ok: false, error: "Responsável sem Slack User ID configurado (Configurações → Slack)" };

  const priorityEmoji: Record<string, string> = {
    high: "🔴",
    medium: "🟡",
    low: "🟢",
  };

  const lines: string[] = [
    `🔔 *Lembrete de tarefa*${requestedBy ? ` — pedido por ${requestedBy}` : ""}`,
    `*${taskTitle}*`,
  ];
  if (taskDescription) lines.push(taskDescription);
  lines.push("");
  lines.push(`${priorityEmoji[priority] ?? "⚪"} Prioridade: *${priority === "high" ? "Alta" : priority === "medium" ? "Média" : "Baixa"}*`);
  if (client) lines.push(`🏢 Cliente: *${client}*`);
  if (dueDate) lines.push(`📅 Prazo: *${new Date(dueDate).toLocaleDateString("pt-BR")}*`);
  const link = taskId ? `${getBaseUrl()}/tasks?task=${taskId}` : `${getBaseUrl()}/kanban`;
  lines.push("", `<${link}|Ver tarefa →>`);

  const sent = await sendSlackDM(slackUserId, config.botToken, lines.join("\n"));
  return sent ? { ok: true } : { ok: false, error: "Falha ao enviar mensagem no Slack" };
}

export async function notifyTaskCompleted({
  userDbId,
  taskTitle,
  client,
}: {
  userDbId: string;
  taskTitle: string;
  client?: string | null;
}): Promise<void> {
  const config = await getSlackConfig();
  if (!config) return;

  const slackUserId = config.userMap[userDbId];
  if (!slackUserId) return;

  const lines: string[] = [
    `🎉 *Parabéns pela tarefa concluída!*`,
    `*${taskTitle}*`,
  ];
  if (client) lines.push(`🏢 Cliente: *${client}*`);
  lines.push("", "Mandou bem! 💪");

  await sendSlackDM(slackUserId, config.botToken, lines.join("\n"));
}

// DM genérica para um usuário do banco (usada por menções em comentários)
export async function notifyUser(dbUserId: string, message: string): Promise<void> {
  const config = await getSlackConfig();
  if (!config) return;
  const slackUserId = config.userMap[dbUserId];
  if (!slackUserId) return;
  await sendSlackDM(slackUserId, config.botToken, message);
}
