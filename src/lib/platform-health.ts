import { prisma } from "@/lib/prisma";

// "Saúde da plataforma" pro /owner — pega exatamente o tipo de coisa que quebra
// em silêncio (token do Google expirado, cron parado, backup falhando) antes de
// alguém notar na marra. Só sinais operacionais (conexão, timestamp, status),
// nunca dado de negócio — mesma régua do resto do /owner.

type DbHealth = {
  role: string;
  connections: { total: number; active: number; idle: number };
  roleLimit: number | null;
  maxConnections: number | null;
};

async function getDbHealth(): Promise<DbHealth> {
  const [{ role }] = await prisma.$queryRawUnsafe<{ role: string }[]>(`select current_user as role`);

  const [{ total, active, idle }] = await prisma.$queryRawUnsafe<{ total: bigint; active: bigint; idle: bigint }[]>(
    `select
       count(*) as total,
       count(*) filter (where state = 'active') as active,
       count(*) filter (where state = 'idle') as idle
     from pg_stat_activity
     where usename = current_user`
  );

  const roleLimitRows = await prisma.$queryRawUnsafe<{ rolconnlimit: number }[]>(
    `select rolconnlimit from pg_roles where rolname = current_user`
  );
  const maxConnRows = await prisma.$queryRawUnsafe<{ max_connections: string }[]>(`show max_connections`);

  return {
    role,
    connections: { total: Number(total), active: Number(active), idle: Number(idle) },
    roleLimit: roleLimitRows[0] && roleLimitRows[0].rolconnlimit >= 0 ? roleLimitRows[0].rolconnlimit : null,
    maxConnections: maxConnRows[0] ? Number(maxConnRows[0].max_connections) : null,
  };
}

type SquadHealth = {
  id: string;
  name: string;
  google: { connected: boolean; email: string | null };
  lastGmailSync: { at: string; ok: boolean; message: string } | null;
  lastCalendarSync: { at: string; ok: boolean; message: string } | null;
  lastBackup: { at: string; ok: boolean; message: string } | null;
};

export async function getPlatformHealth(): Promise<{ db: DbHealth; squads: SquadHealth[] }> {
  const [db, squads, accounts, logs] = await Promise.all([
    getDbHealth(),
    prisma.squad.findMany({ select: { id: true, name: true }, orderBy: { createdAt: "asc" } }),
    prisma.account.findMany({
      where: { provider: "google", access_token: { not: null } },
      select: { userId: true, user: { select: { squadId: true, email: true } } },
    }),
    // só precisamos da última linha de cada categoria por squad — pega um lote
    // recente e reduz em JS (mesmo padrão já usado em /api/owner/metrics)
    prisma.platformLog.findMany({
      where: { category: { in: ["gmail-sync", "calendar-sync", "backup-email"] }, squadId: { not: null } },
      orderBy: { createdAt: "desc" },
      take: 500,
      select: { squadId: true, category: true, level: true, message: true, createdAt: true },
    }),
  ]);

  const googleBySquad = new Map<string, { email: string | null }>();
  for (const a of accounts) {
    if (!googleBySquad.has(a.user.squadId)) googleBySquad.set(a.user.squadId, { email: a.user.email });
  }

  const lastLogBySquadCategory = new Map<string, (typeof logs)[number]>();
  for (const entry of logs) {
    const key = `${entry.squadId}:${entry.category}`;
    if (!lastLogBySquadCategory.has(key)) lastLogBySquadCategory.set(key, entry);
  }

  const squadsHealth: SquadHealth[] = squads.map((s) => {
    const google = googleBySquad.get(s.id);
    const gmailLog = lastLogBySquadCategory.get(`${s.id}:gmail-sync`);
    const calendarLog = lastLogBySquadCategory.get(`${s.id}:calendar-sync`);
    const backupLog = lastLogBySquadCategory.get(`${s.id}:backup-email`);

    return {
      id: s.id,
      name: s.name,
      google: { connected: !!google, email: google?.email ?? null },
      lastGmailSync: gmailLog
        ? { at: gmailLog.createdAt.toISOString(), ok: gmailLog.level !== "error", message: gmailLog.message }
        : null,
      lastCalendarSync: calendarLog
        ? { at: calendarLog.createdAt.toISOString(), ok: calendarLog.level !== "error", message: calendarLog.message }
        : null,
      lastBackup: backupLog
        ? { at: backupLog.createdAt.toISOString(), ok: backupLog.level !== "error", message: backupLog.message }
        : null,
    };
  });

  return { db, squads: squadsHealth };
}
