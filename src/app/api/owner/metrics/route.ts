import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isOwner } from "@/lib/authz";
import { prisma } from "@/lib/prisma";

// Dashboard de owner (cross-squad) — só métricas agregadas (contagens/taxas), nunca
// o dado de negócio em si (nome de tarefa, cliente etc). Usa `prisma` cru de
// propósito, nunca forSquad/getSquadPrisma — essa rota é a única exceção
// deliberada ao isolamento por squad, protegida por isOwner (não por isAdmin).
// Estilo de agregação (busca com select mínimo + reduce em JS) segue o mesmo
// padrão já usado em /api/automations/stats e /api/recaps/accuracy — nessa escala
// (poucos squads) é mais simples que groupBy multi-nível.

function accuracyOf(byStatus: { pending: number; accepted: number; edited: number; rejected: number }) {
  const evaluated = byStatus.accepted + byStatus.edited + byStatus.rejected;
  return evaluated > 0 ? Math.round(((byStatus.accepted + byStatus.edited) / evaluated) * 100) : null;
}

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isOwner(session)) return NextResponse.json({ error: "Só owner da plataforma pode ver isso" }, { status: 403 });

  const since30d = new Date();
  since30d.setDate(since30d.getDate() - 30);

  const [squads, users, tasks, clients, recaps, recapSuggestions, externalSuggestions, automations, automationRuns30d, assistantMessages] = await Promise.all([
    prisma.squad.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.user.findMany({ select: { id: true, squadId: true, role: true, onboardingCompletedAt: true } }),
    prisma.task.findMany({ select: { squadId: true, source: true, updatedAt: true } }),
    prisma.clientNote.findMany({ select: { squadId: true, status: true, healthStatus: true } }),
    prisma.meetRecap.findMany({ select: { squadId: true, processedAt: true } }),
    prisma.recapSuggestion.findMany({ where: { status: { not: "superseded" } }, select: { status: true, recap: { select: { squadId: true } } } }),
    prisma.externalSuggestion.findMany({ where: { status: { not: "duplicate" } }, select: { status: true, squadId: true } }),
    prisma.automation.findMany({ select: { squadId: true, enabled: true, lastRunAt: true } }),
    prisma.automationRun.findMany({ where: { finishedAt: { gte: since30d } }, select: { status: true, automation: { select: { squadId: true } } } }),
    prisma.assistantMessage.findMany({ select: { userId: true } }),
  ]);

  const userSquadById = new Map(users.map((u) => [u.id, u.squadId]));

  type Bucket = ReturnType<typeof emptyBucket>;
  function emptyBucket() {
    return {
      users: { total: 0, admins: 0, members: 0, pendingOnboarding: 0 },
      tasks: { total: 0, lastActivityAt: null as Date | null },
      clients: { total: 0, ativo: 0, pausado: 0, encerrado: 0, healthVerde: 0, healthAmarelo: 0, healthVermelho: 0 },
      recaps: { total: 0, processed: 0, pending: 0 },
      aiSuggestions: { pending: 0, accepted: 0, edited: 0, rejected: 0, accuracyPct: null as number | null },
      automations: { total: 0, enabled: 0, totalRuns30d: 0, successRate30d: null as number | null },
      assistantMessages: 0,
    };
  }

  const bySquad = new Map<string, Bucket>();
  for (const s of squads) bySquad.set(s.id, emptyBucket());

  for (const u of users) {
    const b = bySquad.get(u.squadId);
    if (!b) continue;
    b.users.total++;
    if (u.role === "admin") b.users.admins++;
    else b.users.members++;
    if (!u.onboardingCompletedAt) b.users.pendingOnboarding++;
  }

  for (const t of tasks) {
    const b = bySquad.get(t.squadId);
    if (!b) continue;
    b.tasks.total++;
    if (!b.tasks.lastActivityAt || t.updatedAt > b.tasks.lastActivityAt) b.tasks.lastActivityAt = t.updatedAt;
  }

  for (const c of clients) {
    const b = bySquad.get(c.squadId);
    if (!b) continue;
    b.clients.total++;
    if (c.status === "ativo") b.clients.ativo++;
    else if (c.status === "pausado") b.clients.pausado++;
    else if (c.status === "encerrado") b.clients.encerrado++;
    if (c.healthStatus === "verde") b.clients.healthVerde++;
    else if (c.healthStatus === "amarelo") b.clients.healthAmarelo++;
    else if (c.healthStatus === "vermelho") b.clients.healthVermelho++;
  }

  for (const r of recaps) {
    const b = bySquad.get(r.squadId);
    if (!b) continue;
    b.recaps.total++;
    if (r.processedAt) b.recaps.processed++;
    else b.recaps.pending++;
  }

  for (const s of recapSuggestions) {
    const b = bySquad.get(s.recap.squadId);
    if (!b) continue;
    if (s.status === "pending" || s.status === "accepted" || s.status === "edited" || s.status === "rejected") {
      b.aiSuggestions[s.status]++;
    }
  }
  for (const s of externalSuggestions) {
    const b = bySquad.get(s.squadId);
    if (!b) continue;
    if (s.status === "pending" || s.status === "accepted" || s.status === "edited" || s.status === "rejected") {
      b.aiSuggestions[s.status]++;
    }
  }
  for (const b of bySquad.values()) b.aiSuggestions.accuracyPct = accuracyOf(b.aiSuggestions);

  for (const a of automations) {
    const b = bySquad.get(a.squadId);
    if (!b) continue;
    b.automations.total++;
    if (a.enabled) b.automations.enabled++;
  }
  const runsBySquad = new Map<string, { total: number; success: number }>();
  for (const r of automationRuns30d) {
    const squadId = r.automation.squadId;
    const acc = runsBySquad.get(squadId) ?? { total: 0, success: 0 };
    acc.total++;
    if (r.status === "success") acc.success++;
    runsBySquad.set(squadId, acc);
  }
  for (const [squadId, acc] of runsBySquad) {
    const b = bySquad.get(squadId);
    if (!b) continue;
    b.automations.totalRuns30d = acc.total;
    b.automations.successRate30d = acc.total > 0 ? Math.round((acc.success / acc.total) * 100) : null;
  }

  for (const m of assistantMessages) {
    const squadId = userSquadById.get(m.userId);
    if (!squadId) continue;
    const b = bySquad.get(squadId);
    if (b) b.assistantMessages++;
  }

  const squadRows = squads.map((s) => ({
    id: s.id,
    name: s.name,
    slug: s.slug,
    createdAt: s.createdAt,
    ...bySquad.get(s.id)!,
  }));

  const totals = squadRows.reduce(
    (acc, s) => ({
      squads: acc.squads + 1,
      users: acc.users + s.users.total,
      tasks: acc.tasks + s.tasks.total,
      clients: acc.clients + s.clients.total,
      recapsProcessed: acc.recapsProcessed + s.recaps.processed,
    }),
    { squads: 0, users: 0, tasks: 0, clients: 0, recapsProcessed: 0 }
  );

  return NextResponse.json({ totals, squads: squadRows });
}
