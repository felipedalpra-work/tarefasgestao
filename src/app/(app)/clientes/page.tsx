import { getClientsTable } from "@/lib/queries";
import { Building2 } from "lucide-react";
import { ClientsTable } from "./ClientsTable";

export default async function ClientesPage() {
  const clients = await getClientsTable();

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-ink">Clientes</h1>
        <p className="text-ink-mid text-sm mt-0.5">
          Status, situação na Oxy e pendências de cada cliente
        </p>
      </div>

      {clients.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <Building2 size={40} className="text-border mb-4" />
          <p className="text-ink-faint text-sm">Nenhum cliente encontrado ainda.</p>
          <p className="text-ink-ghost text-xs mt-1">
            Sincronize o Google Calendar e os Meet Recaps para ver os clientes aqui.
          </p>
        </div>
      ) : (
        <ClientsTable clients={clients} />
      )}
    </div>
  );
}
