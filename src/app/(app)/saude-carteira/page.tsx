import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { forSquad } from "@/lib/tenant-prisma";
import { knownClientNames } from "@/lib/client-resolve";
import { getGustavoMeetings, groupByClient } from "@/lib/pipefy";
import { SaudeCarteiraView } from "./SaudeCarteiraView";

export const metadata = { title: "Saúde da Carteira — O2 Squad" };

export default async function SaudeCarteiraPage() {
  const session = await auth();
  if (!session) redirect("/login");

  let error: string | null = null;
  let groups: Awaited<ReturnType<typeof groupByClient>> = [];
  try {
    const meetings = await getGustavoMeetings();
    const db = forSquad(session.user.squadId);
    const names = [...(await knownClientNames(db, session.user.squadId))];
    groups = groupByClient(meetings, names);
  } catch (e) {
    error = e instanceof Error ? e.message : "Falha ao carregar os dados do Pipefy";
  }

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-ink">Saúde da Carteira</h1>
        <p className="text-ink-mid text-sm mt-0.5">
          Temperatura e reuniões de cada cliente, direto do Pipefy (Squad Gustavo)
        </p>
      </div>
      <SaudeCarteiraView groups={groups} error={error} />
    </div>
  );
}
