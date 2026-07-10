import { NextRequest, NextResponse } from "next/server";
import { syncAllUsers } from "@/lib/gmail-sync";
import { syncAllCalendars } from "@/lib/calendar-sync";
import { checkDeadlines } from "@/lib/deadline-check";
import { checkAllReminders } from "@/lib/reminders";
import { sendMeetingBriefings } from "@/lib/meeting-briefing";
import { sendWeeklyDigest } from "@/lib/weekly-digest";
import { log } from "@/lib/logger";

type Params = { params: Promise<{ job: string }> };

const JOBS: Record<string, () => Promise<void>> = {
  "gmail-sync": syncAllUsers,
  "calendar-sync": syncAllCalendars,
  deadlines: async () => {
    await checkDeadlines();
    await checkAllReminders();
  },
  briefing: async () => {
    await syncAllCalendars();
    await sendMeetingBriefings();
  },
  digest: sendWeeklyDigest,
};

// Endpoint chamado por um agendador externo (GitHub Actions), já que node-cron
// não funciona de forma confiável em funções serverless da Vercel — o processo
// não fica vivo entre requisições, então os timers do node-cron nunca disparam
// de verdade em produção.
export async function GET(req: NextRequest, { params }: Params) {
  const auth = req.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { job } = await params;
  const run = JOBS[job];
  if (!run) return NextResponse.json({ error: `job desconhecido: ${job}` }, { status: 400 });

  try {
    await run();
    return NextResponse.json({ ok: true, job });
  } catch (err) {
    await log("cron", `Erro no job "${job}"`, { level: "error", detail: String(err) });
    return NextResponse.json({ ok: false, job, error: String(err) }, { status: 500 });
  }
}
