import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getClientsTable } from "@/lib/queries";
import { getNegociosFechadosPipefy, matchesClient } from "@/lib/pipefy";
import { ClientsTable } from "./ClientsTable";

export default async function ClientesPage() {
  const session = await auth();
  if (!session) redirect("/login");
  const clients = await getClientsTable(session.user.squadId);

  // negócios fechados no Pipefy ("Contrato assinado") que ainda não têm cliente cadastrado
  // aqui — nudge pra criar, nunca cria sozinho (ver pipefy.ts). Best-effort: Pipefy fora do
  // ar não pode impedir a página de carregar.
  let pipefySuggestions: Awaited<ReturnType<typeof getNegociosFechadosPipefy>> = [];
  try {
    const negocios = await getNegociosFechadosPipefy();
    pipefySuggestions = negocios.filter(
      (n) => !clients.some((c) => matchesClient(n.empresa, c.name))
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
