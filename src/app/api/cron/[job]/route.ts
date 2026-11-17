import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { syncAllUsers } from "@/lib/gmail-sync";
import { syncAllCalendars } from "@/lib/calendar-sync";
import { checkClientTasksOverdue } from "@/lib/deadline-check";
import { checkAllReminders, checkAllTaskDueTimes } from "@/lib/reminders";
import { advanceRecurringTasks } from "@/lib/task-recurrence";
import { sendMeetingBriefings } from "@/lib/meeting-briefing";
import { sendDailyBackups } from "@/lib/backup-email";
import { syncAllSquadsPipefy } from "@/lib/pipefy-sync";
import { sendJobFailureAlertEmail } from "@/lib/email";
import { isEmailEnabled } from "@/lib/settings";
import { log } from "@/lib/logger";

type Params = { params: Promise<{ job: string }> };

// Antes só o backup diário avisava os owners quando falhava (src/lib/backup-email.ts);
// os outros jobs só deixavam um registro em Log que ninguém olhava — foi assim que o
// gmail-sync falhou silenciosamente em 2026-11-16 e sumiu o Meet Recap do dia inteiro
// pra todo mundo sem ninguém perceber. Agora qualquer job que caia aqui no catch avisa
// também. squadId é só pra resolver o remetente do e-mail (ver resolveSystemSenderAccount
// em src/lib/email.ts) — esses jobs rodam pra todos os squads, não tem um squad "dono".
async function alertOwnersOfJobFailure(jobName: string, errorDetail: string): Promise<void> {
  try {
    const [owners, squad] = await Promise.all([
      prisma.platformOwner.findMany({ select: { user: { select: { id: true, email: true } } } }),
      prisma.squad.findFirst({ select: { id: true } }),
    ]);
    if (!squad) return;
    const enabled = await Promise.all(owners.map((o) => isEmailEnabled(o.user.id, "jobFailureAlert")));
    const to = owners.filter((_, i) => enabled[i]).map((o) => o.user.email).filter(Boolean);
    if (to.length === 0) return;
    await sendJobFailureAlertEmail({ squadId: squad.id, to, jobName, squadName: "Todos os squads", errorDetail });
  } catch (alertErr) {
    console.error("[cron] falha ao alertar owners:", alertErr);
  }
}

// "backup-email" monta uma planilha por squad (várias idas ao banco em
// sequência) — no plano padrão da Vercel o default de 10s não é suficiente
export const maxDuration = 60;

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
    await checkClientTasksOverdue();
    await checkAllReminders();
  },
  briefing: async () => {
    await syncAllCalendars();
    await sendMeetingBriefings();
  },
  // backup diário por e-mail (planilha .xlsx por squad, pros admins) — ver
  // src/lib/backup-email.ts. Existe por causa do episódio de set/2026 (banco
  // bloqueado por quota, backup mais recente disponível com 10 dias).
  "backup-email": sendDailyBackups,
  // Temperatura/Próximos Passos do Pipefy (Squad Gustavo) -> CalendarEvent, pra
  // não divergir do que a Revisão Semanal mostra — ver src/lib/pipefy-sync.ts.
  "pipefy-sync": syncAllSquadsPipefy,
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
    const detail = String(err);
    await log("cron", `Erro no job "${job}"`, { level: "error", detail });
    await alertOwnersOfJobFailure(job, detail);
    return NextResponse.json({ ok: false, job, error: detail }, { status: 500 });
  }
}
