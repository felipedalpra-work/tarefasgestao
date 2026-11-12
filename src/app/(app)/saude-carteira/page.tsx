import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { forSquad } from "@/lib/tenant-prisma";
import { knownClientNames } from "@/lib/client-resolve";
import {
  getGustavoMeetings,
  groupByClient,
  getOnboardingCards,
  onboardingSummaryForClient,
  latestComiteMensal,
  getClientesEstabelecidosPipefy,
  type OnboardingOverviewRow,
} from "@/lib/pipefy";
import { SaudeCarteiraView } from "./SaudeCarteiraView";

export const metadata = { title: "Saúde da Carteira — O2 Squad" };

// reunião do Pipefy casada com o CalendarEvent correspondente (pipefyRecordId, mesmo match
// que o sync diário já faz) — é o que permite editar Temperatura/Próximos Passos/Presença/
// Registro/sugestão da IA direto aqui na aba Temperatura, igual já funcionava na aba
// Reuniões do cliente (que virou só leitura — ver ClientTabs.tsx)
export type MatchedCalendarEvent = {
  id: string;
  startAt: string;
  endAt: string;
  meetingType: string | null;
  temperature: string | null;
  nextSteps: string | null;
  suggestedTemperature: string | null;
  suggestedNextSteps: string | null;
  attendanceConfirmed: boolean;
  registroConferido: boolean;
  resumoEditado: string | null;
};

export default async function SaudeCarteiraPage() {
  const session = await auth();
  if (!session) redirect("/login");

  let error: string | null = null;
  let groups: Awaited<ReturnType<typeof groupByClient>> = [];
  let onboardingRows: OnboardingOverviewRow[] = [];
  const calendarEventsByPipefyId: Record<string, MatchedCalendarEvent> = {};
  try {
    const [meetings, cards, clientesEstabelecidos] = await Promise.all([
      getGustavoMeetings(),
      getOnboardingCards(),
      getClientesEstabelecidosPipefy(),
    ]);
    const db = forSquad(session.user.squadId);
    const names = [...(await knownClientNames(db, session.user.squadId))];
    groups = groupByClient(meetings, names);

    const matchedEvents = await db.calendarEvent.findMany({
      where: { pipefyRecordId: { not: null } },
      select: {
        id: true, startAt: true, endAt: true, meetingType: true, temperature: true, nextSteps: true,
        suggestedTemperature: true, suggestedNextSteps: true, attendanceConfirmed: true,
        registroConferido: true, resumoEditado: true, pipefyRecordId: true,
      },
    });
    for (const e of matchedEvents) {
      calendarEventsByPipefyId[e.pipefyRecordId!] = {
        id: e.id,
        startAt: e.startAt.toISOString(),
        endAt: e.endAt.toISOString(),
        meetingType: e.meetingType,
        temperature: e.temperature,
        nextSteps: e.nextSteps,
        suggestedTemperature: e.suggestedTemperature,
        suggestedNextSteps: e.suggestedNextSteps,
        attendanceConfirmed: e.attendanceConfirmed,
        registroConferido: e.registroConferido,
        resumoEditado: e.resumoEditado,
      };
    }

    const pendentesByClient = new Map(groups.map((g) => [g.client, g.pendentes]));
    onboardingRows = names
      .map((client) => {
        const summary = onboardingSummaryForClient(cards, client, clientesEstabelecidos);
        const comite = latestComiteMensal(meetings, client);
        return {
          client,
          kickoff: summary.kickoff,
          diagnostico: summary.diagnostico,
          oxy: summary.oxy,
          comiteMensalData: comite?.data ?? null,
          reunioesPendentes: pendentesByClient.get(client) ?? 0,
        };
      })
      .sort((a, b) => a.client.localeCompare(b.client));
  } catch (e) {
    error = e instanceof Error ? e.message : "Falha ao carregar os dados do Pipefy";
  }

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-ink">Saúde da Carteira</h1>
        <p className="text-ink-mid text-sm mt-0.5">
          Temperatura, reuniões e jornada de onboarding de cada cliente, direto do Pipefy
        </p>
      </div>
      <SaudeCarteiraView
        groups={groups}
        onboardingRows={onboardingRows}
        calendarEventsByPipefyId={calendarEventsByPipefyId}
        error={error}
      />
    </div>
  );
}
