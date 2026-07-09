"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { toast } from "@/components/Toaster";
import type { TratativaData } from "@/components/TratativaCard";

export function NewTratativaForm({
  client,
  clientOptions,
  onCreated,
}: {
  client?: string;
  clientOptions?: string[];
  onCreated: (t: TratativaData) => void;
}) {
  const [open, setOpen] = useState(false);
  const [selectedClient, setSelectedClient] = useState(client ?? "");
  const [tipo, setTipo] = useState<"preventiva" | "reativa">("preventiva");
  const [motivo, setMotivo] = useState("");
  const [descricao, setDescricao] = useState("");
  const [problemaNaOxy, setProblemaNaOxy] = useState(false);
  const [saving, setSaving] = useState(false);

  async function submit() {
    const finalClient = client ?? selectedClient;
    if (!finalClient.trim() || !motivo.trim()) {
      toast("Preencha cliente e motivo", "error");
      return;
    }
    setSaving(true);
    const res = await fetch("/api/tratativas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ client: finalClient.trim(), tipo, motivo, descricao: descricao || null, problemaNaOxy }),
    });
    setSaving(false);
    if (res.ok) {
      onCreated(await res.json());
      setMotivo("");
      setDescricao("");
      setProblemaNaOxy(false);
      setTipo("preventiva");
      if (!client) setSelectedClient("");
      setOpen(false);
      toast("Tratativa aberta", "success");
    } else {
      toast("Erro ao abrir tratativa", "error");
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 bg-o2-green text-bg px-4 py-2.5 rounded-xl font-bold text-sm hover:bg-o2-green-bright transition-all"
      >
        <Plus size={14} />
        Abrir tratativa
      </button>
    );
  }

  return (
    <div className="bg-surface border border-surface-3 rounded-xl p-4 space-y-3">
      {!client && (
        <div>
          <label className="text-xs text-ink-faint block mb-1">Cliente</label>
          <input
            list="tratativa-client-options"
            type="text"
            value={selectedClient}
            onChange={(e) => setSelectedClient(e.target.value)}
            placeholder="Nome do cliente"
            className="w-full bg-surface-2 border border-surface-3 rounded-lg px-3 py-2 text-sm text-ink placeholder:text-ink-ghost focus:outline-none focus:border-o2-green/50"
          />
          {clientOptions && (
            <datalist id="tratativa-client-options">
              {clientOptions.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          )}
        </div>
      )}

      <div className="flex gap-2">
        {(["preventiva", "reativa"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTipo(t)}
            className={
              "flex-1 text-xs font-medium px-3 py-2 rounded-lg transition-all " +
              (tipo === t ? "bg-o2-green/10 text-o2-green" : "bg-surface-2 border border-surface-3 text-ink-dim hover:text-ink")
            }
          >
            {t === "preventiva" ? "Preventiva (alinhamento)" : "Reativa (pedido de churn)"}
          </button>
        ))}
      </div>

      <div>
        <label className="text-xs text-ink-faint block mb-1">Motivo</label>
        <input
          type="text"
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          placeholder="Ex: insatisfação com prazo de entrega"
          className="w-full bg-surface-2 border border-surface-3 rounded-lg px-3 py-2 text-sm text-ink placeholder:text-ink-ghost focus:outline-none focus:border-o2-green/50"
        />
      </div>

      <div>
        <label className="text-xs text-ink-faint block mb-1">Descrição</label>
        <textarea
          value={descricao}
          onChange={(e) => setDescricao(e.target.value)}
          rows={2}
          placeholder="Contexto do que aconteceu"
          className="w-full bg-surface-2 border border-surface-3 rounded-lg px-3 py-2 text-sm text-ink placeholder:text-ink-ghost focus:outline-none focus:border-o2-green/50 resize-none"
        />
      </div>

      <label className="flex items-center gap-2 text-xs text-ink-dim cursor-pointer">
        <input type="checkbox" checked={problemaNaOxy} onChange={(e) => setProblemaNaOxy(e.target.checked)} className="accent-o2-green" />
        Envolve problema na Oxy
      </label>

      <div className="flex gap-2">
        <button
          onClick={submit}
          disabled={saving}
          className="bg-o2-green text-bg px-4 py-2 rounded-lg font-bold text-xs hover:bg-o2-green-bright transition-all disabled:opacity-50"
        >
          {saving ? "Salvando…" : "Abrir tratativa"}
        </button>
        <button
          onClick={() => setOpen(false)}
          className="bg-surface-2 border border-surface-3 text-ink-dim px-4 py-2 rounded-lg font-medium text-xs hover:text-ink transition-all"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}
