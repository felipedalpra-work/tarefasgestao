import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getTratativas, getUsers, getClientsTable } from "@/lib/queries";
import { getClientsEmTratativaPipefy, matchesClient } from "@/lib/pipefy";
import { TratativasBoard } from "./TratativasBoard";

export default async function TratativasPage() {
  const session = await auth();
  if (!session) redirect("/login");
  const squadId = session.user.squadId;
  const [tratativas, users, clients] = await Promise.all([getTratativas(squadId), getUsers(squadId), getClientsTable(squadId)]);

  // clientes que o CS já sinalizou "Em Tratativa" no Pipefy mas que não têm nenhuma
  // Tratativa aberta aqui — nudge pra abrir, nunca cria sozinho (ver pipefy.ts). Best-effort:
  // Pipefy fora do ar não pode impedir a página de carregar.
  let pipefySuggestions: string[] = [];
  try {
    const pipefyClients = await getClientsEmTratativaPipefy();
    const openClients = new Set(tratativas.filter((t) => t.status !== "concluida").map((t) => t.client));
    pipefySuggestions = clients
      .map((c) => c.name)
      .filter((name) => !openClients.has(name) && pipefyClients.some((pc) => matchesClient(pc, name)));
  } catch {}

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-ink">Tratativas</h1>
        <p className="text-ink-mid text-sm mt-0.5">
          Risco e atrito com clientes — abra cedo, antes que vire pedido de churn
        </p>
      </div>

      <TratativasBoard
        tratativas={tratativas.map((t) => ({
          ...t,
          dataPrevistaFinalizacao: t.dataPrevistaFinalizacao ? new Date(t.dataPrevistaFinalizacao).toISOString() : null,
          churnData: t.churnData ? new Date(t.churnData).toISOString() : null,
          createdAt: new Date(t.createdAt).toISOString(),
        }))}
        users={users}
        clientOptions={clients.map((c) => c.name)}
        pipefySuggestions={pipefySuggestions}
      />
    </div>
  );
}
