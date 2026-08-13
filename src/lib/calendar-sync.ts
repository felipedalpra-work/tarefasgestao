import { prisma } from "./prisma";
import { forSquad } from "./tenant-prisma";
import { google } from "googleapis";
import { log } from "./logger";

// extrai o nome do cliente do título: "O2 Inc. & Zé do Flor | Semanal" → "Zé do Flor"
// exige o "|" — sem ele não dá pra distinguir reunião de cliente de reunião pessoal
// (ex: "O2 Inc & Fulano de Contato, 11am" não é uma reunião de cliente)
export function extractClientFromTitle(title: string): string | null {
  const match = title.match(/O2\s*Inc\.?\s*&\s*(.+?)\s*\|/i);
  return match ? match[1].trim() : null;
}

// extrai o tipo de reunião do título: "O2 Inc & Zé do Flor | Comitê Estratégico Mensal" → "comite"
export function extractMeetingTypeFromTitle(title: string): string | null {
  const match = title.match(/\|\s*(.+)$/);
  if (!match) return null;
  const raw = match[1].trim().toLowerCase();
  if (raw.includes("comit")) return "comite";
  if (raw.includes("semanal") || raw === "weekly") return "semanal";
  if (raw.includes("kickoff") || raw.includes("kick-off") || raw.includes("kick off")) return "kickoff";
  if (raw.includes("setup")) return "setup";
  if (raw.includes("interno")) return "interno";
  return null;
}

// e-mail (minúsculo) → User.id, pra resolver os convidados de cada reunião contra o
// MESMO squad de quem está sincronizando — não pode misturar com o e-mail de outro squad
async function buildEmailToUserId(squadId: string): Promise<Map<string, string>> {
  const users = await forSquad(squadId).user.findMany({ select: { id: true, email: true } });
  return new Map(users.map((u) => [u.email.toLowerCase(), u.id]));
}

export async function syncCalendarForUser(userId: string, emailToUserId?: Map<string, string>): Promise<number> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { squadId: true } });
  if (!user) return 0;
  const db = forSquad(user.squadId);

  const account = await prisma.account.findFirst({
    where: { userId, provider: "google" },
  });
  if (!account?.access_token) return 0;

  const emailMap = emailToUserId ?? (await buildEmailToUserId(user.squadId));

  try {
    const oauth2 = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET
    );
    oauth2.setCredentials({
      access_token: account.access_token,
      refresh_token: account.refresh_token ?? undefined,
    });

    const calendar = google.calendar({ version: "v3", auth: oauth2 });

    const now = new Date();
    const in30days = new Date(now);
    in30days.setDate(in30days.getDate() + 30);

    const res = await calendar.events.list({
      calendarId: "primary",
      timeMin: now.toISOString(),
      timeMax: in30days.toISOString(),
      q: "O2 Inc &",
      singleEvents: true,
      orderBy: "startTime",
      maxResults: 50,
    });

    const events = res.data.items || [];
    let synced = 0;

    for (const event of events) {
      const title = event.summary || "";
      const client = extractClientFromTitle(title);
      if (!client) continue;

      const startAt = new Date(event.start?.dateTime || event.start?.date || "");
      const endAt = new Date(event.end?.dateTime || event.end?.date || "");
      if (isNaN(startAt.getTime())) continue;

      const meetingType = extractMeetingTypeFromTitle(title);

      // participantes conhecidos do squad (por e-mail) — quem sincronizou sempre entra,
      // mesmo que o Google não liste o dono do calendário em "attendees"
      const attendeeIds = new Set<string>();
      attendeeIds.add(userId);
      for (const attendee of event.attendees ?? []) {
        const email = attendee.email?.toLowerCase();
        const matchedId = email ? emailMap.get(email) : undefined;
        if (matchedId) attendeeIds.add(matchedId);
      }
      const attendeeUserIds = [...attendeeIds];

      await db.calendarEvent.upsert({
        where: { squadId_googleId: { squadId: user.squadId, googleId: event.id! } },
        update: { title, client, startAt, endAt, meetingType, attendeeUserIds },
        create: { squadId: user.squadId, googleId: event.id!, title, client, startAt, endAt, meetingType, attendeeUserIds },
      });
      synced++;
    }

    if (synced > 0) {
      await log("calendar-sync", `${synced} evento(s) sincronizado(s) do Google Calendar`);
    }
    return synced;
  } catch (err) {
    await log("calendar-sync", "Erro ao sincronizar Google Calendar", {
      level: "error",
      detail: String(err),
    });
    console.error(`[calendar-sync] erro userId=${userId}:`, err);
    return 0;
  }
}

export async function syncAllCalendars(): Promise<void> {
  const accounts = await prisma.account.findMany({
    where: { provider: "google" },
    select: { userId: true },
    distinct: ["userId"],
  });

  // cada conta resolve o mapa de e-mails do próprio squad internamente — não dá pra
  // compartilhar um mapa só entre squads diferentes
  for (const { userId } of accounts) {
    const count = await syncCalendarForUser(userId);
    if (count > 0) console.log(`[calendar-sync] userId=${userId}: ${count} evento(s) sincronizado(s)`);
  }
}
