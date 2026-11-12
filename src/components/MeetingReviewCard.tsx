"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { AutoGrowTextarea } from "@/components/AutoGrowTextarea";

// Card completo de reunião (Temperatura, Próximos passos, Presença/Registro, sugestão da
// IA, Resumo do Pipefy) — compartilhado entre a aba Reuniões do cliente (ClientTabs.tsx) e
// a aba Reuniões da Revisão Semanal, pra não duplicar a mesma UI/interação nos dois lugares.
export type MeetingReviewEvent = {
  id: string;
  title: string;
  startAt: string | Date;
  endAt: string | Date;
  meetingType: string | null;
  temperature: string | null;
  nextSteps: string | null;
  suggestedTemperature: string | null;
  suggestedNextSteps: string | null;
  attendanceConfirmed: boolean;
  registroConferido: boolean;
  pipefyResumo: string | null; // "Resumo" da reunião no Pipefy, ao vivo — null quando não casou com nenhum registro
  resumoEditado: string | null; // cópia editável na plataforma — tem prioridade sobre pipefyResumo na exibição, nunca escrita de volta no Pipefy
};

export type MeetingReviewField = "temperature" | "nextSteps" | "attendanceConfirmed" | "registroConferido" | "resumoEditado";

const MEETING_TYPE_INFO: Record<string, { label: string; className: string }> = {
  semanal: { label: "Semanal", className: "bg-surface-3 text-ink-soft" },
  comite: { label: "Comitê Estratégico Mensal", className: "bg-o2-green/15 text-o2-green" },
  kickoff: { label: "Kickoff", className: "bg-blue-400/10 text-blue-400" },
  setup: { label: "Setup", className: "bg-yellow-400/10 text-yellow-400" },
  interno: { label: "Interno", className: "bg-surface-3 text-ink-faint" },
};

// 3 níveis, de propósito iguais às 3 cores do Pipefy (🟢🟡🔴) — ver pushCalendarEventToPipefy
const TEMPERATURE_INFO: Record<string, { className: string }> = {
  bom: { className: "bg-o2-green/10 text-o2-green" },
  atencao: { className: "bg-yellow-400/10 text-yellow-400" },
  critico: { className: "bg-red-400/10 text-red-400" },
};

// pro banner de sugestão da IA — mesmo emoji das opções do dropdown de Temperatura
const TEMPERATURE_LABEL: Record<string, string> = { bom: "🟢 Bom", atencao: "🟡 Atenção", critico: "🔴 Crítico" };

export function MeetingReviewCard({
  event: e,
  onFieldChange,
  onApproveSuggestion,
  onDismissSuggestion,
}: {
  event: MeetingReviewEvent;
  onFieldChange: (field: MeetingReviewField, value: string | boolean) => void;
  onApproveSuggestion: () => void;
  onDismissSuggestion: () => void;
}) {
  const [resumoAberto, setResumoAberto] = useState(false);
  const [proximosPassosAberto, setProximosPassosAberto] = useState(false);

  const start = new Date(e.startAt);
  const end = new Date(e.endAt);
  const isPast = start < new Date();
  const typeInfo = MEETING_TYPE_INFO[e.meetingType ?? ""];

  return (
    <div className="bg-surface border border-surface-3 rounded-xl p-4">
      <div className="flex items-start gap-4">
        <div className="text-center min-w-[44px]">
          <p className="text-xs text-ink-dim">{start.toLocaleDateString("pt-BR", { month: "short" }).toUpperCase()}</p>
          <p className="text-xl font-bold text-ink leading-tight">{start.getDate()}</p>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-medium text-ink truncate">{e.title}</p>
            {typeInfo && <span className={cn("text-[10px] font-medium px-1.5 py-0.5 rounded", typeInfo.className)}>{typeInfo.label}</span>}
          </div>
          <p className="text-xs text-ink-dim mt-0.5">
            {start.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })} –{" "}
            {end.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
            {" · "}
            {start.toLocaleDateString("pt-BR", { weekday: "long" })}
          </p>
        </div>
        <span className={cn("text-xs px-2 py-1 rounded-full shrink-0", isPast ? "bg-surface-3 text-ink-faint" : "bg-o2-green/10 text-o2-green")}>
          {isPast ? "Realizada" : "Agendada"}
        </span>
      </div>
      {isPast && (
        <div className="mt-3 pt-3 border-t border-surface-3 space-y-2.5">
          {e.suggestedTemperature && (
            <div className="bg-o2-green/5 border border-o2-green/20 rounded-lg px-3 py-2.5 space-y-1.5">
              <p className="text-xs text-ink-dim">
                🤖 IA sugere: <span className="font-medium text-ink">{TEMPERATURE_LABEL[e.suggestedTemperature] ?? e.suggestedTemperature}</span>
              </p>
              {e.suggestedNextSteps && <p className="text-xs text-ink-faint line-clamp-2">{e.suggestedNextSteps}</p>}
              <div className="flex items-center gap-2 pt-0.5">
                <button
                  onClick={onApproveSuggestion}
                  className="text-xs font-medium px-2.5 py-1 rounded-lg bg-o2-green/15 text-o2-green hover:bg-o2-green/25 transition-colors"
                >
                  Aprovar
                </button>
                <button
                  onClick={onDismissSuggestion}
                  className="text-xs font-medium px-2.5 py-1 rounded-lg text-ink-faint hover:text-ink transition-colors"
                >
                  Editar
                </button>
              </div>
            </div>
          )}
          <div className="flex items-center gap-2">
            <span className="text-xs text-ink-faint w-28 shrink-0">Temperatura:</span>
            <select
              value={e.temperature ?? ""}
              onChange={(ev) => onFieldChange("temperature", ev.target.value)}
              className={cn(
                "text-xs font-medium rounded-full px-2.5 py-1 border-0 focus:outline-none focus:ring-1 focus:ring-o2-green/50 cursor-pointer appearance-none",
                TEMPERATURE_INFO[e.temperature ?? ""]?.className ?? "bg-surface-3 text-ink-faint"
              )}
            >
              {/* emoji de propósito (não só cor via CSS, que o <option> nativo não
                  respeita direito em todo navegador) — mesmas cores do Pipefy, pra
                  reconhecer de relance sem precisar abrir e ler o texto */}
              <option value="" className="bg-panel text-ink">⚪ não definida</option>
              <option value="bom" className="bg-panel text-ink">🟢 Bom</option>
              <option value="atencao" className="bg-panel text-ink">🟡 Atenção</option>
              <option value="critico" className="bg-panel text-ink">🔴 Crítico</option>
            </select>
          </div>
          <div>
            <button onClick={() => setProximosPassosAberto((v) => !v)} className="text-xs font-medium text-ink-dim hover:text-ink transition-colors">
              {proximosPassosAberto ? "▾" : "▸"} Próximos passos
            </button>
            {proximosPassosAberto && (
              <AutoGrowTextarea
                defaultValue={e.nextSteps ?? ""}
                placeholder="Validados na reunião"
                onBlur={(ev) => {
                  if (ev.target.value !== (e.nextSteps ?? "")) onFieldChange("nextSteps", ev.target.value);
                }}
                className="mt-1.5 w-full text-xs text-ink-soft placeholder:text-ink-ghost bg-surface-2 border border-surface-3 rounded-lg p-2.5 focus:outline-none focus:border-o2-green/50"
              />
            )}
          </div>
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-1.5 text-xs text-ink-dim cursor-pointer">
              <input
                type="checkbox"
                checked={e.attendanceConfirmed}
                onChange={(ev) => onFieldChange("attendanceConfirmed", ev.target.checked)}
                className="accent-o2-green"
              />
              Presença confirmada
            </label>
            <label className="flex items-center gap-1.5 text-xs text-ink-dim cursor-pointer">
              <input
                type="checkbox"
                checked={e.registroConferido}
                onChange={(ev) => onFieldChange("registroConferido", ev.target.checked)}
                className="accent-o2-green"
              />
              Registro conferido
            </label>
          </div>
          {(e.resumoEditado ?? e.pipefyResumo) && (
            <div>
              <button onClick={() => setResumoAberto((v) => !v)} className="text-xs font-medium text-ink-dim hover:text-ink transition-colors">
                {resumoAberto ? "▾" : "▸"} Resumo (Pipefy)
              </button>
              {resumoAberto && (
                <AutoGrowTextarea
                  defaultValue={e.resumoEditado ?? e.pipefyResumo ?? ""}
                  onBlur={(ev) => {
                    const value = ev.target.value;
                    if (value !== (e.resumoEditado ?? e.pipefyResumo ?? "")) onFieldChange("resumoEditado", value);
                  }}
                  className="mt-1.5 w-full text-xs text-ink-mid bg-surface-2 border border-surface-3 rounded-lg p-2.5 focus:outline-none focus:border-o2-green/50"
                />
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
