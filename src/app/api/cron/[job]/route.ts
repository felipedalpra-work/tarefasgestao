import { NextRequest, NextResponse } from "next/server";
import { syncAllUsers } from "@/lib/gmail-sync";
import { syncAllCalendars } from "@/lib/calendar-sync";
import { checkDeadlines, checkClientTasksOverdue } from "@/lib/deadline-check";
import { checkAllReminders, checkAllTaskDueTimes } from "@/lib/reminders";
import { advanceRecurringTasks } from "@/lib/task-recurrence";
import { sendMeetingBriefings } from "@/lib/meeting-briefing";
import { sendWeeklyDigest } from "@/lib/weekly-digest";
import { log } from "@/lib/logger";

type Params = { params: Promise<{ job: string }> };

const JOBS: Record<string, () => Promise<void>> = {
  "gmail-sync": syncAllUsers,
  "calendar-sync": syncAllCalendars,
  // de 5 em 5 min: materializa a próxima ocorrência das tarefas recorrentes e avisa
  // quem tem tarefa com horário marcado cuja hora chegou. Precisa dessa frequência
  // porque é o que dá a granularidade do "às 9h" — os outros jobs rodam 1-2x/dia.
  "task-reminders": async () => {
    await advanceRecurringTasks();
    await checkAllTaskDueTimes();
  },
  deadlines: async () => {
    await checkDeadlines();
    await checkClientTasksOverdue();
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
//
// O secret aceita duas formas: header `Authorization: Bearer <secret>` (o que o
// GitHub Actions usa, preferível) ou `?key=<secret>` na URL. A segunda existe pro
// agendador externo pontual (ver docs/agendador-externo.md): vários serviços de
// ping gratuitos só sabem chamar uma URL, sem header customizado. É menos seguro
// (secret aparece em log/histórico de URL), então só use quando o serviço não
// tiver header — e regenere o secret se ele vazar.
export async function GET(req: NextRequest, { params }: Params) {
  const secret = process.env.CRON_SECRET;
  const authorized =
    !!secret &&
    (req.headers.get("authorization") === `Bearer ${secret}` || req.nextUrl.searchParams.get("key") === secret);
  if (!authorized) {
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
