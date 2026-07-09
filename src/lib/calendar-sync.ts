import { prisma } from "./prisma";
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

export async function syncCalendarForUser(userId: string): Promise<number> {
  const account = await prisma.account.findFirst({
    where: { userId, provider: "google" },
  });
  if (!account?.access_token) return 0;

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

      await prisma.calendarEvent.upsert({
        where: { googleId: event.id! },
        update: { title, client, startAt, endAt, meetingType },
        create: { googleId: event.id!, title, client, startAt, endAt, meetingType },
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

  for (const { userId } of accounts) {
    const count = await syncCalendarForUser(userId);
    if (count > 0) console.log(`[calendar-sync] userId=${userId}: ${count} evento(s) sincronizado(s)`);
  }
}
