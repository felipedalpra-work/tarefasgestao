import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getClientsTable } from "@/lib/queries";
import { getClientesNovosAlocadosGustavo, getStatusSugeridoPipefy, matchesClient } from "@/lib/pipefy";
import { ClientsTable } from "./ClientsTable";

export default async function ClientesPage() {
  const session = await auth();
  if (!session) redirect("/login");
  const clients = await getClientsTable(session.user.squadId);

  // clientes com CFO já alocado no Pipefy (ver pipefy.ts) que ainda não têm cliente
  // cadastrado aqui — nudge pra criar, nunca cria sozinho. Best-effort: Pipefy fora do ar
  // não pode impedir a página de carregar.
  //
  // getClientesNovosAlocadosGustavo() olha só "teve card de onboarding com Gustavo
  // como responsável, em QUALQUER fase (inclusive fases antigas/Cancelado)" — não sabe
  // nada sobre o status atual do cliente no CS. Achado real: cliente que já tinha
  // onboarding registrado, foi removido da tabela `clients` e depois foi pro Churn
  // (fase "Churn" do pipe 3.00 Central de Projetos) continuava sendo sugerido pra
  // cadastro de novo, como se fosse cliente novo. Por isso cruza aqui com
  // getStatusSugeridoPipefy() e tira quem já está em Churn.
  let pipefySuggestions: Awaited<ReturnType<typeof getClientesNovosAlocadosGustavo>> = [];
  try {
    const [alocados, statusSugerido] = await Promise.all([
      getClientesNovosAlocadosGustavo(),
      getStatusSugeridoPipefy(),
    ]);
    const churned = statusSugerido.filter((s) => s.status === "encerrado");
    pipefySuggestions = alocados.filter(
      (n) =>
        !clients.some((c) => matchesClient(n.client, c.name)) &&
        !churned.some((s) => matchesClient(n.client, s.client))
    );
  } catch {}

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-ink">Clientes</h1>
        <p className="text-ink-mid text-sm mt-0.5">
          Status, situação na Oxy e pendências de cada cliente
        </p>
      </div>

      <ClientsTable clients={clients} pipefySuggestions={pipefySuggestions} />
    </div>
  );
}
