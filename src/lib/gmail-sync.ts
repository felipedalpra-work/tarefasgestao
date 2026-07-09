import { prisma } from "./prisma";
import { processRecap } from "./process-recap";
import { google } from "googleapis";
import { log } from "./logger";

function extractTextFromParts(parts: any[]): string {
  let text = "";
  for (const part of parts) {
    if (part.mimeType === "text/plain" && part.body?.data) {
      text += Buffer.from(part.body.data, "base64").toString("utf-8");
    } else if (part.mimeType === "text/html" && part.body?.data && !text) {
      const html = Buffer.from(part.body.data, "base64").toString("utf-8");
      text += html
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<\/p>/gi, "\n")
        .replace(/<\/div>/gi, "\n")
        .replace(/<\/li>/gi, "\n")
        .replace(/<[^>]+>/g, "")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/\n{3,}/g, "\n\n")
        .trim();
    } else if (part.parts) {
      const nested = extractTextFromParts(part.parts);
      if (nested) text += nested;
    }
  }
  return text;
}

export async function syncUserGmail(userId: string): Promise<{ synced: number; suggestionsExtracted: number }> {
  const account = await prisma.account.findFirst({
    where: { userId, provider: "google" },
  });

  if (!account?.access_token) return { synced: 0, suggestionsExtracted: 0 };

  try {
    const oauth2 = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET
    );
    oauth2.setCredentials({
      access_token: account.access_token,
      refresh_token: account.refresh_token ?? undefined,
    });

    const gmail = google.gmail({ version: "v1", auth: oauth2 });

    const listRes = await gmail.users.messages.list({
      userId: "me",
      q: "label:Meet_Recap",
      maxResults: 20,
    });

    const messages = listRes.data.messages || [];
    let synced = 0;
    let suggestionsExtracted = 0;
    const newRecapIds: string[] = [];

    for (const msg of messages) {
      const existing = await prisma.meetRecap.findUnique({ where: { gmailId: msg.id! } });
      if (existing) continue;

      const full = await gmail.users.messages.get({ userId: "me", id: msg.id!, format: "full" });
      const headers = full.data.payload?.headers || [];
      const subject = headers.find((h) => h.name === "Subject")?.value || "(sem assunto)";

      let body = "";
      const payload = full.data.payload;
      if (payload?.parts && payload.parts.length > 0) {
        body = extractTextFromParts(payload.parts);
      } else if (payload?.body?.data) {
        const raw = Buffer.from(payload.body.data, "base64").toString("utf-8");
        body = payload.mimeType === "text/html"
          ? raw.replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/\n{3,}/g, "\n\n").trim()
          : raw;
      }

      const recap = await prisma.meetRecap.create({
        data: { gmailId: msg.id!, subject, body },
      });

      newRecapIds.push(recap.id);
      synced++;
    }

    for (const recapId of newRecapIds) {
      const count = await processRecap(recapId);
      suggestionsExtracted += count;
    }

    if (synced > 0) {
      await log("gmail-sync", `${synced} novo(s) Meet Recap sincronizado(s)`, {
        detail: `${suggestionsExtracted} sugestão(ões) de tarefa identificada(s) via IA`,
      });
    }
    return { synced, suggestionsExtracted };
  } catch (err) {
    await log("gmail-sync", "Erro ao sincronizar Gmail", {
      level: "error",
      detail: String(err),
    });
    console.error(`[gmail-sync] erro userId=${userId}:`, err);
    return { synced: 0, suggestionsExtracted: 0 };
  }
}

export async function syncAllUsers(): Promise<void> {
  const accounts = await prisma.account.findMany({
    where: { provider: "google" },
    select: { userId: true },
    distinct: ["userId"],
  });

  console.log(`[cron] sincronizando ${accounts.length} usuário(s)...`);

  for (const { userId } of accounts) {
    const { synced, suggestionsExtracted } = await syncUserGmail(userId);
    if (synced > 0) {
      console.log(`[cron] userId=${userId}: ${synced} recap(s), ${suggestionsExtracted} sugestão(ões) extraída(s)`);
    }
  }
}
