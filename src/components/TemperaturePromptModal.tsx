"use client";

import { useState } from "react";
import { Thermometer, X } from "lucide-react";
import { AutoGrowTextarea } from "./AutoGrowTextarea";
import { toast } from "./Toaster";

// Mesmo critério padrão de src/lib/temperature-suggestion.ts (DEFAULT_TEMPERATURE_PROMPT)
// — duplicado aqui de propósito: é só o texto inicial do textarea (ponto de partida
// editável), não precisa importar lib de servidor num componente client.
const DEFAULT_PROMPT = `🟢 Bom: cliente satisfeito, sem pendências críticas, reunião produtiva, sem reclamações.
🟡 Atenção: pendências recorrentes, atrasos, dúvidas não resolvidas, leve insatisfação.
🔴 Crítico: cliente insatisfeito, risco de cancelamento/churn, problema grave sem solução encaminhada, conflito.`;

// Aparece 1x pra qualquer admin do squad que ainda não configurou (ou dispensou) o
// critério de Temperatura — ver needsSetup calculado em src/app/(app)/layout.tsx. "Agora
// não" marca como dispensado (não insiste de novo), mas o campo continua em
// Configurações → Critério de Temperatura (IA) pra preencher quando quiser.
export function TemperaturePromptModal({ needsSetup }: { needsSetup: boolean }) {
  const [open, setOpen] = useState(needsSetup);
  const [prompt, setPrompt] = useState(DEFAULT_PROMPT);
  const [saving, setSaving] = useState(false);

  if (!open) return null;

  async function save() {
    setSaving(true);
    const res = await fetch("/api/settings/pipefy-temperature", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: prompt.trim() || DEFAULT_PROMPT }),
    });
    setSaving(false);
    if (res.ok) {
      toast("Critério de temperatura salvo", "success");
      setOpen(false);
    } else {
      toast("Erro ao salvar — tente de novo", "error");
    }
  }

  async function dismiss() {
    setOpen(false); // fecha na hora, não espera a resposta — "Agora não" não deveria travar
    await fetch("/api/settings/pipefy-temperature", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dismissed: true }),
    });
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 animate-fade-in">
      <div className="bg-panel border border-surface-3 rounded-2xl p-6 max-w-lg w-full animate-slide-in-up">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-ink flex items-center gap-2">
            <Thermometer size={16} className="text-o2-green" />
            Critério de Temperatura das reuniões
          </h3>
          <button onClick={dismiss} className="text-ink-faint hover:text-ink">
            <X size={16} />
          </button>
        </div>
        <p className="text-xs text-ink-dim mb-4">
          A IA vai sugerir a Temperatura (🟢🟡🔴) e os Próximos Passos de cada reunião a
          partir da ata, pra você só aprovar ou ajustar. Defina aqui o que conta como Bom,
          Atenção ou Crítico — pode editar isso depois em Configurações a qualquer momento.
        </p>

        <AutoGrowTextarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={6}
          maxHeight={320}
          className="w-full bg-surface border border-surface-3 rounded-xl px-3 py-2 text-xs text-ink placeholder:text-ink-ghost focus:outline-none focus:border-o2-green/50 font-mono"
        />

        <div className="flex gap-2 justify-end mt-5">
          <button
            onClick={dismiss}
            disabled={saving}
            className="text-xs px-4 py-2 rounded-lg font-medium text-ink-dim hover:text-ink transition-all disabled:opacity-50"
          >
            Agora não
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="flex items-center gap-1.5 bg-o2-green text-bg px-4 py-2 rounded-lg font-bold text-xs hover:bg-o2-green-bright transition-all disabled:opacity-50"
          >
            {saving ? "Salvando…" : "Salvar"}
          </button>
        </div>
      </div>
    </div>
  );
}
