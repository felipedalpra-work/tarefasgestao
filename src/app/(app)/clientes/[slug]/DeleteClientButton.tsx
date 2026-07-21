"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { toast } from "@/components/Toaster";

type Counts = { tasks: number; events: number; recaps: number; tratativas: number };

export function DeleteClientButton({ client, counts }: { client: string; counts: Counts }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    setDeleting(true);
    const res = await fetch(`/api/clients/${encodeURIComponent(client)}`, { method: "DELETE" });
    setDeleting(false);
    if (res.ok) {
      toast("Cliente excluído", "success");
      router.push("/clientes");
    } else {
      const data = await res.json().catch(() => ({}));
      toast(data.error || "Erro ao excluir cliente", "error");
    }
  }

  if (!confirming) {
    return (
      <button
        onClick={() => setConfirming(true)}
        className="flex items-center gap-1.5 text-xs text-ink-faint hover:text-red-400 transition-colors shrink-0"
        title="Excluir cliente"
      >
        <Trash2 size={14} />
        Excluir cliente
      </button>
    );
  }

  return (
    <div className="bg-red-400/5 border border-red-400/30 rounded-xl p-4 max-w-sm shrink-0">
      <p className="text-xs text-ink-soft mb-2.5">
        Isso apaga <span className="text-ink font-medium">{client}</span> e tudo ligado a ele — {counts.tasks} tarefa(s),{" "}
        {counts.events} reunião(ões), {counts.recaps} recap(s), {counts.tratativas} tratativa(s). Não pode ser desfeito.
      </p>
      <p className="text-xs text-ink-dim mb-1.5">Digite o nome do cliente pra confirmar:</p>
      <input
        type="text"
        value={confirmText}
        onChange={(e) => setConfirmText(e.target.value)}
        placeholder={client}
        autoFocus
        className="w-full bg-surface border border-surface-3 rounded-lg px-3 py-1.5 text-xs text-ink mb-2.5 focus:outline-none focus:border-red-400/50"
      />
      <div className="flex gap-2 justify-end">
        <button
          onClick={() => { setConfirming(false); setConfirmText(""); }}
          className="text-xs px-3 py-1.5 rounded-lg font-medium text-ink-dim hover:text-ink transition-colors"
        >
          Cancelar
        </button>
        <button
          onClick={handleDelete}
          disabled={confirmText !== client || deleting}
          className="text-xs px-3 py-1.5 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {deleting ? "Excluindo..." : "Excluir definitivamente"}
        </button>
      </div>
    </div>
  );
}
