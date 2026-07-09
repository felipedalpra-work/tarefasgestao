"use client";

import { useState } from "react";
import Link from "next/link";
import { AlertTriangle, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/components/Toaster";

export type TratativaData = {
  id: string;
  client: string;
  tipo: string;
  motivo: string;
  descricao: string | null;
  satisfacao: string | null;
  problemaNaOxy: boolean;
  status: string;
  responsavelId: string | null;
  responsavel: { id: string; name: string | null; image: string | null } | null;
  dataPrevistaFinalizacao: string | Date | null;
  planoDeAcao: string | null;
  desfecho: string | null;
  churnMotivo: string | null;
  churnData: string | Date | null;
  createdBy?: { id: string; name: string | null } | null;
  createdAt: string | Date;
};

type UserOption = { id: string; name: string | null };

const STATUS_OPTIONS = [
  { value: "triagem", label: "Triagem", className: "bg-surface-3 text-ink-soft" },
  { value: "em_tratativa", label: "Em tratativa com CS", className: "bg-yellow-400/10 text-yellow-400" },
  { value: "plano_de_acao", label: "Plano de ação", className: "bg-blue-400/10 text-blue-400" },
  { value: "concluida", label: "Concluída", className: "bg-o2-green/10 text-o2-green" },
];

const DESFECHO_OPTIONS = [
  { value: "", label: "— sem desfecho —" },
  { value: "recuperado", label: "Recuperado" },
  { value: "churn", label: "Churn" },
  { value: "downsell", label: "Downsell" },
  { value: "mudanca_escopo", label: "Mudança de escopo" },
  { value: "desistencia", label: "Desistência" },
];

const CHURN_MOTIVO_OPTIONS = [
  "Financeiro",
  "Atendimento O2",
  "Comercial O2",
  "Replanejamento do Cliente",
  "Cliente Omisso",
  "Problema na Oxy",
  "Serviço Finalizado",
];

export function TratativaCard({
  tratativa,
  users,
  onChange,
  showClientLink,
}: {
  tratativa: TratativaData;
  users: UserOption[];
  onChange: (updated: TratativaData) => void;
  showClientLink?: boolean;
}) {
  const [saving, setSaving] = useState(false);

  async function patch(data: Record<string, unknown>) {
    setSaving(true);
    const res = await fetch(`/api/tratativas/${tratativa.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    setSaving(false);
    if (res.ok) {
      onChange(await res.json());
    } else {
      toast("Erro ao salvar", "error");
    }
  }

  const statusOpt = STATUS_OPTIONS.find((o) => o.value === tratativa.status);

  return (
    <div className={cn("bg-surface border rounded-xl p-4 space-y-3", tratativa.tipo === "reativa" ? "border-red-400/30" : "border-surface-3")}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            {tratativa.tipo === "reativa" ? (
              <span className="flex items-center gap-1 text-xs font-medium text-red-400 bg-red-400/10 px-2 py-0.5 rounded-full">
                <AlertTriangle size={11} /> Reativa (pedido de churn)
              </span>
            ) : (
              <span className="flex items-center gap-1 text-xs font-medium text-o2-green bg-o2-green/10 px-2 py-0.5 rounded-full">
                <ShieldCheck size={11} /> Preventiva
              </span>
            )}
            {tratativa.problemaNaOxy && (
              <span className="text-xs font-medium text-yellow-400 bg-yellow-400/10 px-2 py-0.5 rounded-full">Problema na Oxy</span>
            )}
            {showClientLink && (
              <Link href={`/clientes/${encodeURIComponent(tratativa.client)}`} className="text-xs text-ink-dim hover:text-o2-green transition-colors">
                {tratativa.client}
              </Link>
            )}
          </div>
          <p className="text-sm font-medium text-ink mt-1.5">{tratativa.motivo}</p>
          {tratativa.descricao && <p className="text-xs text-ink-dim mt-1">{tratativa.descricao}</p>}
        </div>
        <select
          value={tratativa.status}
          onChange={(e) => patch({ status: e.target.value })}
          disabled={saving}
          className={cn(
            "text-xs font-medium rounded-full px-2.5 py-1 border-0 focus:outline-none focus:ring-1 focus:ring-o2-green/50 cursor-pointer appearance-none shrink-0",
            statusOpt?.className ?? "bg-surface-3 text-ink-soft"
          )}
        >
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value} className="bg-panel text-ink">
              {o.label}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-surface-3">
        <div>
          <label className="text-xs text-ink-faint block mb-1">Responsável</label>
          <select
            value={tratativa.responsavelId ?? ""}
            onChange={(e) => patch({ responsavelId: e.target.value || null })}
            className="w-full bg-surface-2 border border-surface-3 rounded-lg px-2 py-1.5 text-xs text-ink-soft focus:outline-none focus:border-o2-green/50"
          >
            <option value="">— ninguém —</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs text-ink-faint block mb-1">Data prevista de finalização</label>
          <input
            type="date"
            value={tratativa.dataPrevistaFinalizacao ? new Date(tratativa.dataPrevistaFinalizacao).toISOString().slice(0, 10) : ""}
            onChange={(e) => patch({ dataPrevistaFinalizacao: e.target.value || null })}
            className="w-full bg-surface-2 border border-surface-3 rounded-lg px-2 py-1.5 text-xs text-ink-soft focus:outline-none focus:border-o2-green/50"
          />
        </div>
        <div>
          <label className="text-xs text-ink-faint block mb-1">Satisfação</label>
          <input
            type="text"
            defaultValue={tratativa.satisfacao ?? ""}
            onBlur={(e) => e.target.value !== (tratativa.satisfacao ?? "") && patch({ satisfacao: e.target.value || null })}
            className="w-full bg-surface-2 border border-surface-3 rounded-lg px-2 py-1.5 text-xs text-ink-soft focus:outline-none focus:border-o2-green/50"
          />
        </div>
      </div>

      <div>
        <label className="text-xs text-ink-faint block mb-1">Plano de ação</label>
        <textarea
          defaultValue={tratativa.planoDeAcao ?? ""}
          rows={2}
          onBlur={(e) => e.target.value !== (tratativa.planoDeAcao ?? "") && patch({ planoDeAcao: e.target.value || null })}
          placeholder="Ação combinada com o cliente"
          className="w-full bg-surface-2 border border-surface-3 rounded-lg px-3 py-2 text-xs text-ink-soft placeholder:text-ink-ghost focus:outline-none focus:border-o2-green/50 resize-none"
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-surface-3">
        <div>
          <label className="text-xs text-ink-faint block mb-1">Desfecho</label>
          <select
            value={tratativa.desfecho ?? ""}
            onChange={(e) => patch({ desfecho: e.target.value || null })}
            className="w-full bg-surface-2 border border-surface-3 rounded-lg px-2 py-1.5 text-xs text-ink-soft focus:outline-none focus:border-o2-green/50"
          >
            {DESFECHO_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
        {tratativa.desfecho === "churn" && (
          <>
            <div>
              <label className="text-xs text-ink-faint block mb-1">Motivo do churn</label>
              <select
                value={tratativa.churnMotivo ?? ""}
                onChange={(e) => patch({ churnMotivo: e.target.value || null })}
                className="w-full bg-surface-2 border border-surface-3 rounded-lg px-2 py-1.5 text-xs text-ink-soft focus:outline-none focus:border-o2-green/50"
              >
                <option value="">— selecione —</option>
                {CHURN_MOTIVO_OPTIONS.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-ink-faint block mb-1">Data do churn</label>
              <input
                type="date"
                value={tratativa.churnData ? new Date(tratativa.churnData).toISOString().slice(0, 10) : ""}
                onChange={(e) => patch({ churnData: e.target.value || null })}
                className="w-full bg-surface-2 border border-surface-3 rounded-lg px-2 py-1.5 text-xs text-ink-soft focus:outline-none focus:border-o2-green/50"
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
