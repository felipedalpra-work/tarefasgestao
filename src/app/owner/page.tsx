"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Building2, Users, CheckSquare, TrendingUp, ArrowLeft, Crown } from "lucide-react";

type SquadMetrics = {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
  users: { total: number; admins: number; members: number; pendingOnboarding: number };
  tasks: { total: number; lastActivityAt: string | null };
  clients: { total: number; ativo: number; pausado: number; encerrado: number; healthVerde: number; healthAmarelo: number; healthVermelho: number };
  recaps: { total: number; processed: number; pending: number };
  aiSuggestions: { pending: number; accepted: number; edited: number; rejected: number; accuracyPct: number | null };
  automations: { total: number; enabled: number; totalRuns30d: number; successRate30d: number | null };
  assistantMessages: number;
};

type Metrics = {
  totals: { squads: number; users: number; tasks: number; clients: number; recapsProcessed: number };
  squads: SquadMetrics[];
};

export default function OwnerPage() {
  const [data, setData] = useState<Metrics | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/owner/metrics")
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then(setData)
      .catch(() => setError("Erro ao carregar métricas."));
  }, []);

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto">
      <Link href="/dashboard" className="inline-flex items-center gap-1.5 text-sm text-ink-dim hover:text-ink mb-6 transition-colors">
        <ArrowLeft size={14} />
        Voltar pro meu squad
      </Link>

      <div className="mb-8 flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-o2-green/10 flex items-center justify-center shrink-0">
          <Crown size={18} className="text-o2-green" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-ink">Painel da plataforma</h1>
          <p className="text-ink-mid text-sm mt-0.5">Métricas agregadas de todos os squads — só números, não o dado de negócio de cada um</p>
        </div>
      </div>

      {error && <p className="text-sm text-red-400 bg-red-400/10 px-4 py-3 rounded-xl">{error}</p>}

      {!data && !error && (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-20 bg-surface-2 rounded-xl animate-pulse" />
          ))}
        </div>
      )}

      {data && (
        <>
          <div className="bg-surface border border-surface-3 rounded-xl px-5 py-4 mb-6 flex items-center gap-6 md:gap-10 flex-wrap">
            <Stat icon={Building2} value={data.totals.squads} label="Squads" />
            <Stat icon={Users} value={data.totals.users} label="Usuários" />
            <Stat icon={CheckSquare} value={data.totals.tasks} label="Tarefas" />
            <Stat icon={Building2} value={data.totals.clients} label="Clientes" />
            <Stat icon={TrendingUp} value={data.totals.recapsProcessed} label="Meet Recaps processados" />
          </div>

          <div className="bg-surface border border-surface-3 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-surface-2 text-ink-dim text-xs uppercase tracking-wide">
                  <tr>
                    <th className="text-left px-4 py-3">Squad</th>
                    <th className="text-left px-4 py-3">Usuários</th>
                    <th className="text-left px-4 py-3">Tarefas</th>
                    <th className="text-left px-4 py-3">Clientes</th>
                    <th className="text-left px-4 py-3">Meet Recaps</th>
                    <th className="text-left px-4 py-3">Sugestões IA</th>
                    <th className="text-left px-4 py-3">Automações</th>
                    <th className="text-left px-4 py-3">Assistente</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-3">
                  {data.squads.map((s) => (
                    <tr key={s.id} className="hover:bg-surface-2/50 transition-colors">
                      <td className="px-4 py-3">
                        <p className="text-ink font-medium">{s.name}</p>
                        <p className="text-xs text-ink-faint">
                          {s.slug} · criado {formatDistanceToNow(new Date(s.createdAt), { addSuffix: true, locale: ptBR })}
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-ink">{s.users.total}</p>
                        <p className="text-xs text-ink-faint">
                          {s.users.admins} admin{s.users.admins !== 1 ? "s" : ""} · {s.users.members} membro{s.users.members !== 1 ? "s" : ""}
                          {s.users.pendingOnboarding > 0 && <> · {s.users.pendingOnboarding} sem onboarding</>}
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-ink">{s.tasks.total}</p>
                        <p className="text-xs text-ink-faint">
                          {s.tasks.lastActivityAt
                            ? `última ${formatDistanceToNow(new Date(s.tasks.lastActivityAt), { addSuffix: true, locale: ptBR })}`
                            : "sem tarefa ainda"}
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-ink">{s.clients.total}</p>
                        <p className="text-xs text-ink-faint">{s.clients.ativo} ativo{s.clients.ativo !== 1 ? "s" : ""}</p>
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-ink">{s.recaps.processed}/{s.recaps.total}</p>
                        <p className="text-xs text-ink-faint">processados</p>
                      </td>
                      <td className="px-4 py-3">
                        <p className={s.aiSuggestions.accuracyPct === null ? "text-ink-faint" : s.aiSuggestions.accuracyPct >= 80 ? "text-o2-green" : s.aiSuggestions.accuracyPct >= 50 ? "text-yellow-400" : "text-red-400"}>
                          {s.aiSuggestions.accuracyPct === null ? "—" : `${s.aiSuggestions.accuracyPct}%`}
                        </p>
                        <p className="text-xs text-ink-faint">{s.aiSuggestions.pending} pendente{s.aiSuggestions.pending !== 1 ? "s" : ""}</p>
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-ink">{s.automations.enabled}/{s.automations.total} ativa{s.automations.total !== 1 ? "s" : ""}</p>
                        <p className="text-xs text-ink-faint">
                          {s.automations.successRate30d === null ? "sem execução 30d" : `${s.automations.successRate30d}% sucesso (30d)`}
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-ink">{s.assistantMessages}</p>
                        <p className="text-xs text-ink-faint">mensagens</p>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function Stat({ icon: Icon, value, label }: { icon: React.ElementType; value: number; label: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <Icon size={15} className="text-ink-mid" />
      <span className="text-xl font-bold text-ink">{value}</span>
      <span className="text-xs text-ink-mid">{label}</span>
    </div>
  );
}
