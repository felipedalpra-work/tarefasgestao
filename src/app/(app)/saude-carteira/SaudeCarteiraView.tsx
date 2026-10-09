"use client";

import { useMemo, useState } from "react";
import { ChevronDown, AlertTriangle, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ClientGroup, PipefyMeeting, Temperatura } from "@/lib/pipefy";

const TEMP_META: Record<string, { dot: string; label: string; chip: string }> = {
  "🔴": { dot: "bg-red-500", label: "Vermelho", chip: "bg-red-500/10 text-red-400" },
  "🟡": { dot: "bg-amber-400", label: "Amarelo", chip: "bg-amber-400/10 text-amber-400" },
  "🟢": { dot: "bg-o2-green", label: "Verde", chip: "bg-o2-green/10 text-o2-green" },
  "⚪ Não qualifica": { dot: "bg-ink-dim/50", label: "Não qualifica", chip: "bg-ink-dim/10 text-ink-dim" },
  "": { dot: "bg-ink-dim/40", label: "Sem leitura", chip: "bg-ink-dim/10 text-ink-dim" },
};

function tempMeta(t: Temperatura) {
  return TEMP_META[t] ?? TEMP_META[""];
}

// Pipefy devolve a data como MM/DD/YYYY — exibe dd/mm/aaaa.
function fmtData(d: string): string {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec((d || "").trim());
  if (!m) return d || "—";
  return `${m[2].padStart(2, "0")}/${m[1].padStart(2, "0")}/${m[3]}`;
}

function splitPassos(texto: string): string[] {
  return (texto || "")
    .replace(/^🤖[^\n]*\n?/, "")
    .split(/\n|•/)
    .map((s) => s.trim())
    .filter(Boolean);
}

type Filtro = "todos" | "🔴" | "🟡" | "🟢" | "pendentes";

export function SaudeCarteiraView({ groups, error }: { groups: ClientGroup[]; error: string | null }) {
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [aberto, setAberto] = useState<Set<string>>(new Set());

  const contagem = useMemo(() => {
    const c = { "🔴": 0, "🟡": 0, "🟢": 0, pendentes: 0 };
    for (const g of groups) {
      if (g.temperatura === "🔴") c["🔴"]++;
      else if (g.temperatura === "🟡") c["🟡"]++;
      else if (g.temperatura === "🟢") c["🟢"]++;
      if (g.pendentes > 0) c.pendentes++;
    }
    return c;
  }, [groups]);

  const visiveis = useMemo(() => {
    if (filtro === "todos") return groups;
    if (filtro === "pendentes") return groups.filter((g) => g.pendentes > 0);
    return groups.filter((g) => g.temperatura === filtro);
  }, [groups, filtro]);

  function toggle(client: string) {
    setAberto((prev) => {
      const next = new Set(prev);
      if (next.has(client)) next.delete(client);
      else next.add(client);
      return next;
    });
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-4 text-sm text-red-300">
        <div className="flex items-center gap-2 font-medium text-red-300">
          <AlertTriangle size={16} /> Não foi possível carregar o Pipefy
        </div>
        <p className="mt-1 text-red-300/80">{error}</p>
        <p className="mt-2 text-ink-dim">
          Verifique se a variável <code className="font-mono">PIPEFY_TOKEN</code> está configurada no ambiente.
        </p>
      </div>
    );
  }

  const chips: { id: Filtro; label: string }[] = [
    { id: "todos", label: `Todos (${groups.length})` },
    { id: "🔴", label: `🔴 ${contagem["🔴"]}` },
    { id: "🟡", label: `🟡 ${contagem["🟡"]}` },
    { id: "🟢", label: `🟢 ${contagem["🟢"]}` },
    { id: "pendentes", label: `Pendentes (${contagem.pendentes})` },
  ];

  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-5">
        {chips.map((ch) => (
          <button
            key={ch.id}
            onClick={() => setFiltro(ch.id)}
            className={cn(
              "px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border",
              filtro === ch.id
                ? "bg-o2-green/10 text-o2-green border-o2-green/30"
                : "bg-transparent text-ink-mid border-white/10 hover:text-ink"
            )}
          >
            {ch.label}
          </button>
        ))}
      </div>

      {visiveis.length === 0 ? (
        <p className="text-ink-dim text-sm py-8 text-center">Nenhum cliente neste filtro.</p>
      ) : (
        <div className="space-y-2">
          {visiveis.map((g) => (
            <ClientRow key={g.client} g={g} aberto={aberto.has(g.client)} onToggle={() => toggle(g.client)} />
          ))}
        </div>
      )}
    </div>
  );
}

function ClientRow({ g, aberto, onToggle }: { g: ClientGroup; aberto: boolean; onToggle: () => void }) {
  const meta = tempMeta(g.temperatura);
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] overflow-hidden">
      <button onClick={onToggle} className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-white/[0.03] transition-colors">
        <span className={cn("w-2.5 h-2.5 rounded-full shrink-0", meta.dot)} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-ink truncate">{g.client}</span>
            {g.naoCadastrado && (
              <span className="text-[10px] uppercase tracking-wide text-ink-dim border border-white/10 rounded px-1 py-0.5">
                fora da carteira
              </span>
            )}
          </div>
          <div className="text-xs text-ink-dim mt-0.5">
            Última: {fmtData(g.ultimaData)} · {g.meetings.length} reuni{g.meetings.length === 1 ? "ão" : "ões"}
          </div>
        </div>
        {g.pendentes > 0 && (
          <span className="text-xs bg-amber-400/10 text-amber-400 rounded-md px-2 py-0.5 shrink-0">
            {g.pendentes} pendente{g.pendentes === 1 ? "" : "s"}
          </span>
        )}
        <span className={cn("text-xs rounded-md px-2 py-0.5 shrink-0", meta.chip)}>{meta.label}</span>
        <ChevronDown size={16} className={cn("text-ink-dim transition-transform shrink-0", aberto && "rotate-180")} />
      </button>

      {aberto && (
        <div className="px-4 pb-4 pt-1 space-y-3 border-t border-white/5">
          {g.meetings.map((m) => (
            <MeetingCard key={m.id} m={m} />
          ))}
        </div>
      )}
    </div>
  );
}

function MeetingCard({ m }: { m: PipefyMeeting }) {
  const meta = tempMeta(m.temperatura);
  const passos = splitPassos(m.proximosPassos);
  return (
    <div className="rounded-lg bg-white/[0.02] border border-white/5 p-3">
      <div className="flex items-center gap-2 flex-wrap text-xs text-ink-dim">
        <span className={cn("w-2 h-2 rounded-full", meta.dot)} />
        <span className="text-ink-mid font-medium">{fmtData(m.data)}</span>
        {m.tipo && <span>· {m.tipo}</span>}
        {m.clientePresente && <span>· cliente {m.clientePresente.toLowerCase()}</span>}
        {m.status && <span>· {m.status}</span>}
        {!m.preenchida && <span className="text-amber-400">· sem preenchimento</span>}
      </div>

      {m.observacoes && (
        <div className="mt-2">
          <div className="text-[11px] uppercase tracking-wide text-ink-dim mb-0.5">Observações do CFO</div>
          <p className="text-sm text-ink-mid whitespace-pre-wrap">{m.observacoes}</p>
        </div>
      )}

      {passos.length > 0 && (
        <div className="mt-2">
          <div className="text-[11px] uppercase tracking-wide text-ink-dim mb-0.5">Próximos passos</div>
          <ul className="text-sm text-ink-mid list-disc pl-4 space-y-0.5">
            {passos.slice(0, 8).map((p, i) => (
              <li key={i}>{p}</li>
            ))}
          </ul>
        </div>
      )}

      {(m.linkTranscricao || m.linkGravacao) && (
        <div className="mt-2 flex gap-3 text-xs">
          {m.linkTranscricao && (
            <a href={m.linkTranscricao} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-o2-green hover:underline">
              <ExternalLink size={12} /> Transcrição
            </a>
          )}
          {m.linkGravacao && (
            <a href={m.linkGravacao} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-o2-green hover:underline">
              <ExternalLink size={12} /> Gravação
            </a>
          )}
        </div>
      )}
    </div>
  );
}
