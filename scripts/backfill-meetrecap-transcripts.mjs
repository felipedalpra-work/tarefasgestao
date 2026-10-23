// Backfill pontual: os Meet Recaps sincronizados ANTES do fix de
// "extrai da ata completa do Gemini" (commit 5608e5c) ficaram com o resumo
// curto do corpo do e-mail em vez da ata completa (Google Doc linkado) — a
// sincronização normal só busca e-mails NOVOS, então esses recaps antigos
// nunca seriam atualizados sozinhos. Este script refaz, pra cada recap já
// existente que veio do Gmail (tem gmailId), a mesma busca que o sync faz
// hoje: re-busca o e-mail original na caixa do designado do squad, acha o
// link do Google Doc e substitui o body.
//
// Idempotente — rodar de novo não faz mal (só re-busca o mesmo doc).
//
// Uso: node scripts/backfill-meetrecap-transcripts.mjs [--dry-run]
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

// --- mesmas funções de src/lib/gmail-sync.ts (script solto, sem import de TS) ---

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

async function fetchGoogleDocText(oauth2, documentId) {
  const drive = google.drive({ version: "v3", auth: oauth2 });
  const res = await drive.files.export({ fileId: documentId, mimeType: "text/plain" });
  const text = typeof res.data === "string" ? res.data : String(res.data ?? "");
  return text.trim() || null;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// --- main ---

const squads = await prisma.squad.findMany({ select: { id: true, name: true } });

let totalConsidered = 0;
let totalUpdated = 0;
let totalNoDoc = 0;
let totalErrors = 0;
let squadsSkipped = 0;

for (const squad of squads) {
  const designatedSetting = await prisma.setting.findUnique({
    where: { squadId_key: { squadId: squad.id, key: MEET_RECAP_GMAIL_USER_KEY } },
  });
  const designatedUserId = designatedSetting?.value || null;
  if (!designatedUserId) {
    continue; // squad sem Meet Recap configurado — nada a fazer
  }

  const account = await prisma.account.findFirst({
    where: { userId: designatedUserId, provider: "google" },
  });
  if (!account?.access_token) {
    console.log(`[${squad.name}] designado sem conta Google conectada — pulando`);
    squadsSkipped++;
    continue;
  }

  const recaps = await prisma.meetRecap.findMany({
    where: { squadId: squad.id, gmailId: { not: null } },
    orderBy: { createdAt: "asc" },
  });
  if (recaps.length === 0) continue;

  console.log(`\n=== ${squad.name}: ${recaps.length} recap(s) do Gmail ===`);

  const oauth2 = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET);
  oauth2.setCredentials({ access_token: account.access_token, refresh_token: account.refresh_token ?? undefined });
  const gmail = google.gmail({ version: "v1", auth: oauth2 });

  for (const recap of recaps) {
    totalConsidered++;
    try {
      const full = await gmail.users.messages.get({ userId: "me", id: recap.gmailId, format: "full" });
      const payload = full.data.payload;
      const docId = payload?.parts ? findMeetingNotesDocId(payload.parts) : null;
      if (!docId) {
        console.log(`  - "${recap.subject}": sem link de Google Doc nesse e-mail, mantém o resumo`);
        totalNoDoc++;
        continue;
      }

      const text = await fetchGoogleDocText(oauth2, docId);
      if (!text) {
        console.log(`  - "${recap.subject}": doc vazio/inacessível, mantém o resumo`);
        totalNoDoc++;
        continue;
      }

      const newBody = text.slice(0, 20000);
      console.log(`  ✓ "${recap.subject}": ${recap.body?.length ?? 0} → ${newBody.length} chars`);
      if (!DRY_RUN) {
        await prisma.meetRecap.update({ where: { id: recap.id }, data: { body: newBody } });
      }
      totalUpdated++;
    } catch (err) {
      console.log(`  ✗ "${recap.subject}": erro — ${err.message}`);
      totalErrors++;
    }
    await sleep(300); // educado com a cota do Gmail/Drive
  }
}

console.log(`\n${DRY_RUN ? "[DRY RUN] " : ""}TOTAL: ${totalConsidered} recap(s) considerado(s), ${totalUpdated} atualizado(s), ${totalNoDoc} sem doc, ${totalErrors} erro(s), ${squadsSkipped} squad(s) sem conta conectada`);
await prisma.$disconnect();
