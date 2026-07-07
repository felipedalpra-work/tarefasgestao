import { prisma } from "./prisma";
import { getSlackConfig, sendSlackDM } from "./slack";
import { log } from "./logger";
import { getBaseUrl } from "./base-url";

export async function sendWeeklyDigest(): Promise<void> {
  const config = await getSlackConfig();
  if (!config) { console.log("[digest] Slack não configurado, pulando."); return; }

  const users = await prisma.user.findMany({ select: { id: true, name: true } });
  const now = new Date();

  // semana atual: segunda a domingo
  const dayOfWeek = now.getDay() === 0 ? 7 : now.getDay(); // 1=seg, 7=dom
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - dayOfWeek + 1);
  weekStart.setHours(0, 0, 0, 0);

  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);
  weekEnd.setHours(23, 59, 59, 999);

  // semana passada
  const lastWeekStart = new Date(weekStart);
  lastWeekStart.setDate(weekStart.getDate() - 7);
  const lastWeekEnd = new Date(weekStart);
  lastWeekEnd.setMilliseconds(-1);

  for (const user of users) {
    const slackUserId = config.userMap[user.id];
    if (!slackUserId) continue;

    const tasks = await prisma.task.findMany({
      where: { assigneeId: user.id },
      select: { id: true, title: true, status: true, priority: true, dueDate: true, client: true, updatedAt: true },
    });

    const dueThisWeek = tasks.filter(t =>
      t.dueDate && new Date(t.dueDate) >= weekStart && new Date(t.dueDate) <= weekEnd && t.status !== "done"
    );
    const overdue = tasks.filter(t =>
      t.dueDate && new Date(t.dueDate) < now && t.status !== "done"
    );
    const completedLastWeek = tasks.filter(t =>
      t.status === "done" && t.updatedAt >= lastWeekStart && t.updatedAt <= lastWeekEnd
    );
    const openTotal = tasks.filter(t => t.status !== "done").length;

    const weekLabel = weekStart.toLocaleDateString("pt-BR", { day: "2-digit", month: "long" });
    const lines: string[] = [
      `☀️ *Sua semana — a partir de ${weekLabel}*`,
      "",
      `📊 *Resumo:*`,
      `• ${openTotal} tarefa${openTotal !== 1 ? "s" : ""} em aberto`,
    ];

    if (dueThisWeek.length > 0) lines.push(`• ${dueThisWeek.length} vencem esta semana`);
    if (overdue.length > 0) lines.push(`• ${overdue.length} em atraso ⚠️`);
    if (completedLastWeek.length > 0) lines.push(`• ${completedLastWeek.length} concluída${completedLastWeek.length !== 1 ? "s" : ""} na semana passada ✅`);

    if (dueThisWeek.length > 0) {
      lines.push("", "*📅 Vencem esta semana:*");
      dueThisWeek.slice(0, 5).forEach(t => {
        const date = new Date(t.dueDate!).toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "short" });
        lines.push(`• ${t.title}${t.client ? ` · ${t.client}` : ""} · _${date}_`);
      });
      if (dueThisWeek.length > 5) lines.push(`  _…e mais ${dueThisWeek.length - 5}_`);
    }

    if (overdue.length > 0) {
      lines.push("", "*⚠️ Atrasadas:*");
      overdue.slice(0, 3).forEach(t => {
        const daysAgo = Math.floor((now.getTime() - new Date(t.dueDate!).getTime()) / 86400000);
        lines.push(`• ${t.title}${t.client ? ` · ${t.client}` : ""} · _há ${daysAgo} dia${daysAgo !== 1 ? "s" : ""}_`);
      });
      if (overdue.length > 3) lines.push(`  _…e mais ${overdue.length - 3}_`);
    }

    lines.push("", `<${getBaseUrl()}/tasks|Ver todas as tarefas →>`);

    const msg = lines.join("\n");
    try {
      await sendSlackDM(slackUserId, config.botToken, msg);
      await log("digest", `Digest semanal enviado para ${user.name ?? user.id}`);
      console.log(`[digest] enviado para ${user.name}`);
    } catch (err) {
      await log("digest", `Erro ao enviar digest para ${user.name ?? user.id}`, {
        level: "error",
        detail: String(err),
      });
      console.error(`[digest] erro para ${user.name}:`, err);
    }
  }
}
