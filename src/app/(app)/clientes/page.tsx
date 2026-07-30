import { getClientsTable } from "@/lib/queries";
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

      <ClientsTable clients={clients} />
    </div>
  );
}
