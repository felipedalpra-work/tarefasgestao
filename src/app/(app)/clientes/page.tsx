import { getClientsOverview } from "@/lib/queries";
import { Building2, CalendarDays, FileText, CheckSquare, ChevronRight } from "lucide-react";
import Link from "next/link";

export default async function ClientesPage() {
  const clients = await getClientsOverview();

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-ink">Clientes</h1>
        <p className="text-ink-mid text-sm mt-0.5">
          Pastas por empresa — reuniões, recaps e tarefas em um só lugar
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
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {clients.map((c) => (
            <Link
              key={c.name}
              href={`/clientes/${encodeURIComponent(c.name)}`}
              className="group bg-surface border border-surface-3 rounded-xl p-5 hover:border-o2-green/40 hover:bg-skeleton transition-all"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="w-10 h-10 rounded-lg bg-o2-green/10 flex items-center justify-center">
                  <Building2 size={18} className="text-o2-green" />
                </div>
                <ChevronRight size={16} className="text-ink-ghost group-hover:text-o2-green transition-colors mt-1" />
              </div>

              <h2 className="text-sm font-semibold text-ink mb-3 leading-tight">{c.name}</h2>

              <div className="flex items-center gap-4 text-xs text-ink-dim">
                <span className="flex items-center gap-1">
                  <CalendarDays size={12} className="text-ink-faint" />
                  {c.meetings} {c.meetings === 1 ? "reunião" : "reuniões"}
                </span>
                <span className="flex items-center gap-1">
                  <FileText size={12} className="text-ink-faint" />
                  {c.recaps} {c.recaps === 1 ? "recap" : "recaps"}
                </span>
              </div>

              {c.openTasks > 0 && (
                <div className="mt-3 flex items-center gap-1.5">
                  <CheckSquare size={12} className="text-o2-green" />
                  <span className="text-xs text-o2-green font-medium">
                    {c.openTasks} tarefa{c.openTasks > 1 ? "s" : ""} em aberto
                  </span>
                </div>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
