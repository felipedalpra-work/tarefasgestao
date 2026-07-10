import { prisma } from "./prisma";
import { notifyUser } from "./slack";

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

async function broadcast(users: { id: string }[], type: string, message: string, link: string) {
  if (await alreadyNotifiedToday(type, link)) return;
  for (const u of users) {
    await prisma.notification.create({ data: { userId: u.id, type, message, link } });
    await notifyUser(u.id, message).catch(() => {});
  }
}

async function notifyOne(userId: string, type: string, message: string, link: string) {
  if (await alreadyNotifiedToday(type, link)) return;
  await prisma.notification.create({ data: { userId, type, message, link } });
  await notifyUser(userId, message).catch(() => {});
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
export async function checkOnboardingDelays(): Promise<number> {
  const [clients, users] = await Promise.all([
    prisma.clientNote.findMany({ where: { status: "ativo", onboardingStartAt: { not: null } } }),
    prisma.user.findMany({ select: { id: true } }),
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
      await broadcast(users, `onboarding_atraso_${m.key}`, message, link);
      alerted++;
    }
  }
  return alerted;
}

// Tratativas com data prevista de finalização vencida, ainda não concluídas
export async function checkTratativasOverdue(): Promise<number> {
  const [tratativas, users] = await Promise.all([
    prisma.tratativa.findMany({
      where: { status: { not: "concluida" }, dataPrevistaFinalizacao: { not: null, lt: new Date() } },
    }),
    prisma.user.findMany({ select: { id: true } }),
  ]);

  for (const t of tratativas) {
    const link = `/tratativas`;
    const message = `⚠️ Tratativa com prazo vencido: "${t.motivo}" (${t.client}) — previsto pra ${new Date(t.dataPrevistaFinalizacao!).toLocaleDateString("pt-BR")}`;
    if (t.responsavelId) {
      await notifyOne(t.responsavelId, `tratativa_atraso_${t.id}`, message, link);
    } else {
      await broadcast(users, `tratativa_atraso_${t.id}`, message, link);
    }
  }
  return tratativas.length;
}

// Checklist de fechamento do mês incompleto, perto da virada do mês (dias 25-31 do
// mês corrente, e dias 1-5 revendo o mês anterior que já deveria estar fechado)
export async function checkFechamentoIncompleto(): Promise<number> {
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
    prisma.clientNote.findMany({ where: { status: "ativo" }, select: { client: true } }),
    prisma.user.findMany({ select: { id: true } }),
  ]);

  let alerted = 0;
  for (const c of clients) {
    for (const p of periods) {
      const fechamento = await prisma.fechamentoMensal.findUnique({
        where: { client_year_month: { client: c.client, year: p.year, month: p.month } },
      });
      const complete = !!fechamento && fechamento.comiteRealizado && fechamento.rebalanceamentoFeito && fechamento.conciliacaoOk && fechamento.cpCrFechados;
      if (complete) continue;

      const link = `/clientes/${encodeURIComponent(c.client)}`;
      const message = `📋 Fechamento de ${String(p.month).padStart(2, "0")}/${p.year} de ${c.client} está incompleto`;
      await broadcast(users, `fechamento_incompleto_${c.client}_${p.year}_${p.month}`, message, link);
      alerted++;
    }
  }
  return alerted;
}

// Sugestões da IA paradas há mais de 3 dias sem revisão
export async function checkStaleRecapSuggestions(): Promise<number> {
  const threshold = new Date();
  threshold.setDate(threshold.getDate() - 3);

  const [count, users] = await Promise.all([
    prisma.recapSuggestion.count({ where: { status: "pending", createdAt: { lt: threshold } } }),
    prisma.user.findMany({ select: { id: true } }),
  ]);
  if (count === 0) return 0;

  const message = `🤖 ${count} sugestão(ões) da IA aguardando revisão há mais de 3 dias`;
  await broadcast(users, "recap_pendente", message, "/sugestoes-ia");
  return count;
}

export async function checkAllReminders(): Promise<void> {
  await checkOnboardingDelays();
  await checkTratativasOverdue();
  await checkFechamentoIncompleto();
  await checkStaleRecapSuggestions();
}
