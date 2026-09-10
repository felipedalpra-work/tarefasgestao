"use client";

import { X, KeyRound } from "lucide-react";
import { ClientAccessesSection } from "./ClientAccessesSection";

// Atalho pros acessos de ERP de um cliente direto da lista de /clientes, sem precisar
// entrar na página do cliente e navegar até a aba Oxy. Mesmo componente de lista/adicionar
// usado lá (ClientAccessesSection) — só muda a moldura ao redor.
export function ClientAccessesModal({ client, onClose }: { client: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-panel border border-surface-3 rounded-2xl p-6 max-w-lg w-full max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-ink">
            <KeyRound size={15} className="text-o2-green" />
            Acessos — {client}
          </h3>
          <button onClick={onClose} className="text-ink-faint hover:text-ink">
            <X size={16} />
          </button>
        </div>
        <ClientAccessesSection client={client} />
      </div>
    </div>
  );
}
