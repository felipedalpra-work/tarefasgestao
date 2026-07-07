import { prisma } from "./prisma";
import { google } from "googleapis";
import { log } from "./logger";

// extrai o nome do cliente do título: "O2 Inc & Zé do Flor | Weekly" → "Zé do Flor"
export function extractClientFromTitle(title: string): string | null {
  const match = title.match(/O2\s*Inc\s*&\s*(.+?)(?:\s*\|.*)?$/i);
  return match ? match[1].trim() : null;
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

      await prisma.calendarEvent.upsert({
        where: { googleId: event.id! },
        update: { title, client, startAt, endAt },
        create: { googleId: event.id!, title, client, startAt, endAt },
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
