import { prisma } from "./prisma";
import { forSquad } from "./tenant-prisma";
import { notifyUser } from "./slack";
import { isNotificationEnabled } from "./settings";
import { brtNow, timeToMinutes } from "./utils";
import { describeRecurrence } from "./recurrence";

// Evita re-notificar todo mundo toda vez que o cron roda (2x/dia) — só 1 aviso
// por dia pra cada combinação (type + link).
async function alreadyNotifiedToday(type: string, link: string): Promise<boolean> {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const existing = await prisma.notification.findFirst({
    where: { type, link, createdAt: { gte: startOfDay } },
  });
  return !!existing;
}

// sendSlack: normalmente vem de isNotificationEnabled(tipo) — a notificação in-app (sino)
// acontece sempre; o Slack é o canal que dá pra desligar por tipo em Configurações.
async function broadcast(squadId: string, users: { id: string }[], type: string, message: string, link: string, sendSlack: boolean) {
  if (await alreadyNotifiedToday(type, link)) return;
  const db = forSquad(squadId);
  for (const u of users) {
    await db.notification.create({ data: { squadId, userId: u.id, type, message, link } });
    if (sendSlack) await notifyUser(squadId, u.id, message).catch(() => {});
  }
}

async function notifyOne(squadId: string, userId: string, type: string, message: string, link: string, sendSlack: boolean) {
  if (await alreadyNotifiedToday(type, link)) return;
  await forSquad(squadId).notification.create({ data: { squadId, userId, type, message, link } });
  if (sendSlack) await notifyUser(squadId, userId, message).catch(() => {});
}

const MILESTONES = [
  { key: "cfoAllocatedAt", label: "CFO alocado", offsetDays: 2 },
  { key: "kickoffScheduledAt", label: "Kickoff agendado", offsetDays: 3 },
  { key: "kickoffDoneAt", label: "Kickoff realizado", offsetDays: 7 },
  { key: "setupDoneAt", label: "Setup + Comitê de Estruturação", offsetDays: 30 },
  { key: "diagnosticDoneAt", label: "Diagnóstico + Comitê de Diagnóstico", offsetDays: 60 },
  { key: "oxyIntegratedAt", label: "Oxy integrada + Comitê Estratégico Mensal", offsetDays: 90 },
] as const;

// Marcos de onboarding (D+2..D+90) que passaram do prazo sem a data real preenchida
export async function checkOnboardingDelays(squadId: string): Promise<number> {
  const db = forSquad(squadId);
  const [clients, users] = await Promise.all([
    db.clientNote.findMany({ where: { status: "ativo", onboardingStartAt: { not: null } } }),
    db.user.findMany({ select: { id: true } }),
  ]);

  const now = new Date();
  let alerted = 0;

  for (const c of clients) {
    for (const m of MILESTONES) {
      if (c[m.key]) continue; // já concluído
      const target = new Date(c.onboardingStartAt!);
      target.setDate(target.getDate() + m.offsetDays);
      if (target >= now) continue; // ainda não venceu

      const link = `/clientes/${encodeURIComponent(c.client)}`;
      const message = `⏰ Onboarding atrasado: "${m.label}" de ${c.client} venceu em ${target.toLocaleDateString("pt-BR")}`;
      await broadcast(squadId, users, `onboarding_atraso_${m.key}`, message, link, await isNotificationEnabled(squadId, "onboardingDelay"));
      alerted++;
    }
  }
  return alerted;
}

// Tratativas com data prevista de finalização vencida, ainda não concluídas
export async function checkTratativasOverdue(squadId: string): Promise<number> {
  const db = forSquad(squadId);
  const [tratativas, users] = await Promise.all([
    db.tratativa.findMany({
      where: { status: { not: "concluida" }, dataPrevistaFinalizacao: { not: null, lt: new Date() } },
    }),
    db.user.findMany({ select: { id: true } }),
  ]);

  const tratativaSlackEnabled = await isNotificationEnabled(squadId, "tratativaOverdue");
  for (const t of tratativas) {
    const link = `/tratativas`;
    const message = `⚠️ Tratativa com prazo vencido: "${t.motivo}" (${t.client}) — previsto pra ${new Date(t.dataPrevistaFinalizacao!).toLocaleDateString("pt-BR")}`;
    if (t.responsavelId) {
      await notifyOne(squadId, t.responsavelId, `tratativa_atraso_${t.id}`, message, link, tratativaSlackEnabled);
    } else {
      await broadcast(squadId, users, `tratativa_atraso_${t.id}`, message, link, tratativaSlackEnabled);
    }
  }
  return tratativas.length;
}

// Checklist de fechamento do mês incompleto, perto da virada do mês (dias 25-31 do
// mês corrente, e dias 1-5 revendo o mês anterior que já deveria estar fechado)
export async function checkFechamentoIncompleto(squadId: string): Promise<number> {
  const db = forSquad(squadId);
  const now = new Date();
  const day = now.getDate();
  if (day > 5 && day < 25) return 0;

  const periods: { year: number; month: number }[] = [];
  if (day >= 25) periods.push({ year: now.getFullYear(), month: now.getMonth() + 1 });
  if (day <= 5) {
    const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    periods.push({ year: prev.getFullYear(), month: prev.getMonth() + 1 });
  }

  const [clients, users] = await Promise.all([
    db.clientNote.findMany({ where: { status: "ativo" }, select: { client: true } }),
    db.user.findMany({ select: { id: true } }),
  ]);

  let alerted = 0;
  for (const c of clients) {
    for (const p of periods) {
      const fechamento = await db.fechamentoMensal.findUnique({
        where: { squadId_client_year_month: { squadId, client: c.client, year: p.year, month: p.month } },
      });
      const complete = !!fechamento && fechamento.comiteRealizado && fechamento.rebalanceamentoFeito && fechamento.conciliacaoOk && fechamento.cpCrFechados;
      if (complete) continue;

      const link = `/clientes/${encodeURIComponent(c.client)}`;
      const message = `📋 Fechamento de ${String(p.month).padStart(2, "0")}/${p.year} de ${c.client} está incompleto`;
      await broadcast(squadId, users, `fechamento_incompleto_${c.client}_${p.year}_${p.month}`, message, link, await isNotificationEnabled(squadId, "fechamentoIncomplete"));
      alerted++;
    }
  }
  return alerted;
}

// Sugestões da IA paradas há mais de 3 dias sem revisão
export async function checkStaleRecapSuggestions(squadId: string): Promise<number> {
  const db = forSquad(squadId);
  const threshold = new Date();
  threshold.setDate(threshold.getDate() - 3);

  const [count, users] = await Promise.all([
    db.recapSuggestion.count({ where: { status: "pending", createdAt: { lt: threshold }, recap: { squadId } } }),
    db.user.findMany({ select: { id: true } }),
  ]);
  if (count === 0) return 0;

  const message = `🤖 ${count} sugestão(ões) da IA aguardando revisão há mais de 3 dias`;
  await broadcast(squadId, users, "recap_pendente", message, "/sugestoes-ia", await isNotificationEnabled(squadId, "staleRecapSuggestions"));
  return count;
}

// "Hora de fazer": tarefa com horário marcado pra hoje cuja hora já chegou.
//
// Roda no cron de 5 em 5 minutos (job "task-reminders"), e a condição é "já passou
// da hora" em vez de "está dentro da janela de 5 min" de propósito — o agendador do
// GitHub Actions atrasa com frequência, e com janela fixa um atraso engoliria o
// aviso do dia. O dedup por dia (alreadyNotifiedToday) garante um aviso só, mesmo
// com o cron passando várias vezes depois da hora.
export async function checkTaskDueTimes(squadId: string): Promise<number> {
  const db = forSquad(squadId);
  const { today, minutesOfDay } = brtNow();

  // faixa do dia em vez de igualdade: dueDate normalmente é meia-noite UTC exata
  // (vem de <input type="date">), mas tarefa criada por outra fonte pode ter hora
  // embutida e ficaria de fora de um `dueDate: today`
  const tomorrow = new Date(today);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);

  const tasks = await db.task.findMany({
    where: { dueTime: { not: null }, status: { not: "done" }, dueDate: { gte: today, lt: tomorrow } },
    select: {
      id: true, title: true, client: true, dueTime: true, assigneeId: true, createdById: true,
      recurrence: true, recurrenceWeekdays: true,
    },
  });

  const slackEnabled = await isNotificationEnabled(squadId, "taskDueTime");
  let notified = 0;

  for (const task of tasks) {
    const due = timeToMinutes(task.dueTime);
    if (due === null || minutesOfDay < due) continue; // ainda não deu a hora

    // sem responsável (ex: tarefa do cliente) o aviso vai pra quem criou — senão
    // uma rotina com horário marcado não avisaria ninguém
    const userId = task.assigneeId ?? task.createdById;
    const repeat = describeRecurrence(task.recurrence, task.recurrenceWeekdays);
    const message = `⏰ ${task.dueTime} — hora de: ${task.title}${task.client ? ` (${task.client})` : ""}${repeat ? ` · ${repeat}` : ""}`;
    await notifyOne(squadId, userId, `task_hora_${task.id}`, message, `/tasks?task=${task.id}`, slackEnabled);
    notified++;
  }

  return notified;
}

export async function checkAllTaskDueTimes(): Promise<void> {
  const squads = await prisma.squad.findMany({ select: { id: true } });
  for (const { id: squadId } of squads) {
    await checkTaskDueTimes(squadId).catch((e) => console.error(`[task-hora] squad ${squadId}:`, e));
  }
}

export async function checkAllReminders(): Promise<void> {
  const squads = await prisma.squad.findMany({ select: { id: true } });
  for (const { id: squadId } of squads) {
    await checkOnboardingDelays(squadId);
    await checkTratativasOverdue(squadId);
    await checkFechamentoIncompleto(squadId);
    await checkStaleRecapSuggestions(squadId);
  }
}
