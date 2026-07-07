"use client";

import { useState } from "react";
import { Bell } from "lucide-react";
import { toast } from "./Toaster";

export function DeadlineCheckButton() {
  const [loading, setLoading] = useState(false);

  async function check() {
    setLoading(true);
    try {
      const res = await fetch("/api/tasks/deadline-check", { method: "POST" });
      const data = await res.json();
      toast(`Verificação concluída. ${data.sent} email(s) de prazo enviado(s).`, "success");
    } catch {
      toast("Erro ao verificar prazos.", "error");
    }
    setLoading(false);
  }

  return (
    <button
      onClick={check}
      disabled={loading}
      className="flex items-center gap-2 bg-surface border border-surface-3 text-ink px-4 py-2.5 rounded-xl font-medium text-sm hover:border-o2-green/50 transition-all disabled:opacity-50"
    >
      <Bell size={14} className={loading ? "animate-pulse text-o2-green" : "text-ink-mid"} />
      {loading ? "Verificando..." : "Verificar prazos"}
    </button>
  );
}
