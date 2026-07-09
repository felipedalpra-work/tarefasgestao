import { getTratativas, getUsers, getClientsTable } from "@/lib/queries";
import { TratativasBoard } from "./TratativasBoard";

export default async function TratativasPage() {
  const [tratativas, users, clients] = await Promise.all([getTratativas(), getUsers(), getClientsTable()]);

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
      />
    </div>
  );
}
