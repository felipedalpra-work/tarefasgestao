"use client";

import { useState } from "react";
import { Calendar, X } from "lucide-react";

export function DeadlineConfirmModal({
  title,
  initialDate,
  onConfirm,
  onCancel,
}: {
  title: string;
  initialDate: string | null;
  onConfirm: (date: string | null) => void;
  onCancel: () => void;
}) {
  const [date, setDate] = useState(initialDate ? initialDate.slice(0, 10) : "");

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 animate-fade-in" onClick={onCancel}>
      <div
        className="bg-panel border border-surface-3 rounded-2xl p-6 max-w-sm w-full animate-slide-in-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-ink flex items-center gap-2">
            <Calendar size={16} className="text-o2-green" />
            Definir prazo?
          </h3>
          <button onClick={onCancel} className="text-ink-faint hover:text-ink">
            <X size={16} />
          </button>
        </div>
        <p className="text-xs text-ink-dim mb-3">
          Quer colocar um prazo em <span className="text-ink font-medium">&quot;{title}&quot;</span> antes de adicionar? Deixe em branco pra não definir.
        </p>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          autoFocus
          className="w-full bg-surface border border-surface-3 rounded-xl px-4 py-2.5 text-sm text-ink focus:outline-none focus:border-o2-green/50 mb-4"
        />
        <div className="flex gap-2 justify-end">
          <button
            onClick={onCancel}
            className="text-xs px-4 py-2 rounded-lg font-medium text-ink-dim hover:text-ink transition-all"
          >
            Cancelar
          </button>
          <button
            onClick={() => onConfirm(date || null)}
            className="bg-o2-green text-bg px-4 py-2 rounded-lg font-bold text-xs hover:bg-o2-green-bright transition-all"
          >
            Adicionar
          </button>
        </div>
      </div>
    </div>
  );
}
