"use client";

import { useState } from "react";
import { UserAvatar } from "./UserAvatar";
import { cn } from "@/lib/utils";

export type WorkloadRow = { userId: string; name: string | null; image: string | null; onTrack: number; overdue: number; total: number };

// Carga em aberto por pessoa agora (não é série no tempo — é retrato do momento).
// Barra dividida em "no prazo" (verde) + "atrasada" (vermelho), mesmo par de cores
// do gráfico semanal — mesma linguagem visual em todo o painel.
export function WorkloadBars({ rows }: { rows: WorkloadRow[] }) {
  const [hover, setHover] = useState<string | null>(null);
  const max = Math.max(...rows.map((r) => r.total), 1);

  if (rows.length === 0) {
    return <p className="text-sm text-ink-faint text-center py-8">Ninguém com tarefa em aberto agora</p>;
  }

  return (
    <div className="space-y-3">
      {rows.map((r, i) => (
        <div
          key={r.userId}
          className="relative"
          onMouseEnter={() => setHover(r.userId)}
          onMouseLeave={() => setHover((h) => (h === r.userId ? null : h))}
        >
          <div className="flex items-center gap-2.5 mb-1">
            <UserAvatar name={r.name} image={r.image} size="sm" index={i} />
            <span className="text-sm text-ink truncate flex-1">{r.name || "—"}</span>
            <span className="text-xs font-semibold text-ink-mid">{r.total}</span>
          </div>
          <div className="h-2.5 bg-surface-3 rounded-full overflow-hidden flex gap-[2px]">
            {r.onTrack > 0 && (
              <div className="h-full bg-o2-green rounded-full" style={{ width: `${(r.onTrack / max) * 100}%` }} />
            )}
            {r.overdue > 0 && (
              <div className="h-full bg-red-400 rounded-full" style={{ width: `${(r.overdue / max) * 100}%` }} />
            )}
          </div>

          {hover === r.userId && (
            <div className="absolute left-0 top-full mt-1 z-10 bg-surface-3 border border-border rounded-lg px-3 py-2 text-xs shadow-xl whitespace-nowrap">
              <p><span className="text-ink font-semibold">{r.onTrack}</span> <span className="text-o2-green">no prazo</span></p>
              {r.overdue > 0 && <p><span className="text-ink font-semibold">{r.overdue}</span> <span className="text-red-400">atrasada{r.overdue !== 1 ? "s" : ""}</span></p>}
            </div>
          )}
        </div>
      ))}

      <div className="flex items-center gap-4 pt-1 justify-center">
        <span className={cn("flex items-center gap-1.5 text-[11px] text-ink-mid")}>
          <span className="w-2.5 h-2.5 rounded-sm bg-o2-green" /> No prazo
        </span>
        <span className="flex items-center gap-1.5 text-[11px] text-ink-mid">
          <span className="w-2.5 h-2.5 rounded-sm bg-red-400" /> Atrasada
        </span>
      </div>
    </div>
  );
}
