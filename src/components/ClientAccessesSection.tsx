"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { toast } from "./Toaster";
import { ClientLoginRow, type ClientLoginData } from "./ClientLoginRow";

// Seção "Acessos (ERP/login)" de um cliente — extraída de ClientTabs pra ser usada em
// dois lugares sem duplicar a lógica de buscar/adicionar/remover: a aba Oxy da página do
// cliente, e o modal rápido aberto direto da lista de clientes (ver ClientAccessesModal).
export function ClientAccessesSection({ client }: { client: string }) {
  const [logins, setLogins] = useState<ClientLoginData[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    fetch(`/api/clients/${encodeURIComponent(client)}/logins`)
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setLogins(data);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, [client]);

  // empresas já usadas por esse cliente noutro acesso — vira opção de seleção em vez de
  // digitar nome de novo (e evitar "Allebras LTDA" vs "Allebras Ltda" como duas empresas
  // diferentes só por causa de digitação)
  const knownEmpresas = useMemo(() => [...new Set(logins.map((l) => l.empresa).filter((e) => e.trim().length > 0))], [logins]);

  function patchLoginLocal(id: string, patch: Partial<ClientLoginData>) {
    setLogins((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  }

  async function addLogin() {
    setAdding(true);
    const res = await fetch(`/api/clients/${encodeURIComponent(client)}/logins`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ empresa: "", erp: null, accessMode: null }),
    });
    setAdding(false);
    if (res.ok) {
      const created = await res.json();
      setLogins((prev) => [...prev, created]);
    } else {
      toast("Erro ao adicionar acesso", "error");
    }
  }

  async function removeLogin(id: string) {
    const prev = logins;
    setLogins((p) => p.filter((l) => l.id !== id));
    const res = await fetch(`/api/clients/${encodeURIComponent(client)}/logins/${id}`, { method: "DELETE" });
    if (!res.ok) {
      setLogins(prev);
      toast("Erro ao remover acesso", "error");
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <label className="text-xs font-medium text-ink-mid uppercase tracking-wide">Acessos (ERP / login)</label>
        <button
          onClick={addLogin}
          disabled={adding}
          className="flex items-center gap-1 text-xs text-o2-green hover:text-o2-green-bright disabled:opacity-50 transition-colors"
        >
          <Plus size={12} />
          Adicionar
        </button>
      </div>
      {!loaded ? (
        <p className="text-xs text-ink-faint">Carregando…</p>
      ) : logins.length === 0 ? (
        <p className="text-xs text-ink-ghost">Nenhum acesso cadastrado ainda — útil pra clientes com mais de uma empresa/CNPJ.</p>
      ) : (
        <div className="space-y-2">
          {logins.map((login) => (
            <ClientLoginRow
              key={login.id}
              client={client}
              login={login}
              knownEmpresas={knownEmpresas}
              onChange={patchLoginLocal}
              onRemove={removeLogin}
            />
          ))}
        </div>
      )}
    </div>
  );
}
