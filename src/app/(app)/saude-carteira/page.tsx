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
  type OnboardingOverviewRow,
} from "@/lib/pipefy";
import { SaudeCarteiraView } from "./SaudeCarteiraView";

export const metadata = { title: "Saúde da Carteira — O2 Squad" };

export default async function SaudeCarteiraPage() {
  const session = await auth();
  if (!session) redirect("/login");

  let error: string | null = null;
  let groups: Awaited<ReturnType<typeof groupByClient>> = [];
  let onboardingRows: OnboardingOverviewRow[] = [];
  try {
    const [meetings, cards] = await Promise.all([getGustavoMeetings(), getOnboardingCards()]);
    const db = forSquad(session.user.squadId);
    const names = [...(await knownClientNames(db, session.user.squadId))];
    groups = groupByClient(meetings, names);

    const pendentesByClient = new Map(groups.map((g) => [g.client, g.pendentes]));
    onboardingRows = names
      .map((client) => {
        const summary = onboardingSummaryForClient(cards, client);
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
      <SaudeCarteiraView groups={groups} onboardingRows={onboardingRows} error={error} />
    </div>
  );
}
