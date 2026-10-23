// Backfill pontual: MeetRecap.transcriptLink só passou a existir a partir do commit
// 6d637f8 — os recaps sincronizados antes disso (todos, 150) ficaram com null, mesmo
// os que já têm a ata completa no body (backfill anterior). Diferente daquele backfill,
// este NÃO precisa chamar o Drive (só regex na parte HTML do e-mail, mesma lógica de
// findMeetingNotesDocId em src/lib/gmail-sync.ts) — bem mais rápido, sem risco de cota.
//
// Idempotente. Uso: node scripts/backfill-transcript-link.mjs [--dry-run]
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { google } from "googleapis";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../.env") });

const DRY_RUN = process.argv.includes("--dry-run");

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL, max: 1 });
const prisma = new PrismaClient({ adapter });

const MEET_RECAP_GMAIL_USER_KEY = "meet_recap_gmail_user_id";

function findMeetingNotesDocId(parts) {
  for (const part of parts) {
    if (part.mimeType === "text/html" && part.body?.data) {
      const html = Buffer.from(part.body.data, "base64").toString("utf-8");
      const match = html.match(/docs\.google\.com\/document\/d\/([a-zA-Z0-9_-]+)/);
      if (match) return match[1];
    }
    if (part.parts) {
      const found = findMeetingNotesDocId(part.parts);
      if (found) return found;
    }
  }
  return null;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

const squads = await prisma.squad.findMany({ select: { id: true, name: true } });

let totalConsidered = 0;
let totalUpdated = 0;
let totalNoDoc = 0;
let totalErrors = 0;

for (const squad of squads) {
  const designatedSetting = await prisma.setting.findUnique({
    where: { squadId_key: { squadId: squad.id, key: MEET_RECAP_GMAIL_USER_KEY } },
  });
  const designatedUserId = designatedSetting?.value || null;
  if (!designatedUserId) continue;

  const account = await prisma.account.findFirst({ where: { userId: designatedUserId, provider: "google" } });
  if (!account?.access_token) {
    console.log(`[${squad.name}] designado sem conta Google conectada — pulando`);
    continue;
  }

  const recaps = await prisma.meetRecap.findMany({
    where: { squadId: squad.id, gmailId: { not: null }, transcriptLink: null },
    orderBy: { createdAt: "asc" },
  });
  if (recaps.length === 0) continue;

  console.log(`\n=== ${squad.name}: ${recaps.length} recap(s) sem transcriptLink ===`);

  const oauth2 = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET);
  oauth2.setCredentials({ access_token: account.access_token, refresh_token: account.refresh_token ?? undefined });
  const gmail = google.gmail({ version: "v1", auth: oauth2 });

  for (const recap of recaps) {
    totalConsidered++;
    try {
      const full = await gmail.users.messages.get({ userId: "me", id: recap.gmailId, format: "full" });
      const docId = full.data.payload?.parts ? findMeetingNotesDocId(full.data.payload.parts) : null;
      if (!docId) {
        console.log(`  - "${recap.subject}": sem link de Google Doc nesse e-mail`);
        totalNoDoc++;
        continue;
      }
      const link = `https://docs.google.com/document/d/${docId}/edit`;
      console.log(`  ✓ "${recap.subject}": ${link}`);
      if (!DRY_RUN) {
        await prisma.meetRecap.update({ where: { id: recap.id }, data: { transcriptLink: link } });
      }
      totalUpdated++;
    } catch (err) {
      console.log(`  ✗ "${recap.subject}": erro — ${err.message}`);
      totalErrors++;
    }
    await sleep(150);
  }
}

console.log(`\n${DRY_RUN ? "[DRY RUN] " : ""}TOTAL: ${totalConsidered} recap(s) considerado(s), ${totalUpdated} atualizado(s), ${totalNoDoc} sem doc, ${totalErrors} erro(s)`);
await prisma.$disconnect();
