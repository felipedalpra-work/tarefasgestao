"use client";

import { useState } from "react";
import Link from "next/link";
import { Building2, ChevronRight, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/components/Toaster";

export type ClientRow = {
  name: string;
  meetings: number;
  recaps: number;
  tasks: number;
  openTasks: number;
  status: string;
  oxyStage: string;
  importType: string | null;
  lastDataUpdate: string | Date | null;
  oxyPendencies: string | null;
  erp: string | null;
  healthStatus: string;
};

const HEALTH_OPTIONS = [
  { value: "verde", label: "● Saudável", className: "bg-o2-green/10 text-o2-green" },
  { value: "amarelo", label: "● Atenção", className: "bg-yellow-400/10 text-yellow-400" },
  { value: "vermelho", label: "● Crítico", className: "bg-red-400/10 text-red-400" },
];

const STATUS_OPTIONS = [
  { value: "ativo", label: "Ativo", className: "bg-o2-green/10 text-o2-green" },
  { value: "pausado", label: "Pausado", className: "bg-yellow-400/10 text-yellow-400" },
  { value: "encerrado", label: "Encerrado", className: "bg-red-400/10 text-red-400" },
];

const OXY_STAGE_OPTIONS = [
  { value: "nao_iniciado", label: "Não iniciado", className: "bg-surface-3 text-ink-faint" },
  { value: "em_validacao", label: "Em validação", className: "bg-blue-400/10 text-blue-400" },
  { value: "em_implantacao", label: "Em implantação", className: "bg-yellow-400/10 text-yellow-400" },
  { value: "implantacao_interrompida", label: "Implantação interrompida", className: "bg-red-400/10 text-red-400" },
  { value: "ativo", label: "Ativo", className: "bg-o2-green/10 text-o2-green" },
];

const IMPORT_TYPE_OPTIONS = [
  { value: "", label: "—" },
  { value: "manual", label: "Manual" },
  { value: "automatica", label: "Automática" },
  { value: "automatica_manual", label: "Automática/Manual" },
];

function toDateInputValue(v: string | Date | null) {
  if (!v) return "";
  const d = new Date(v);
  return d.toISOString().slice(0, 10);
}

export function ClientsTable({ clients }: { clients: ClientRow[] }) {
  const [rows, setRows] = useState(clients);
  const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null);
  const [deletingName, setDeletingName] = useState<string | null>(null);
  const deleteTarget = rows.find((r) => r.name === confirmingDelete) ?? null;

  async function deleteClient(row: ClientRow) {
    setDeletingName(row.name);
    const res = await fetch(`/api/clients/${encodeURIComponent(row.name)}`, { method: "DELETE" });
    setDeletingName(null);
    setConfirmingDelete(null);
    if (res.ok) {
      setRows((prev) => prev.filter((r) => r.name !== row.name));
      toast("Cliente excluído", "success");
    } else {
      const data = await res.json().catch(() => ({}));
      toast(data.error || "Erro ao excluir cliente", "error");
    }
  }

  async function patch(name: string, body: Record<string, unknown>) {
    const res = await fetch(`/api/clients/${encodeURIComponent(name)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      toast("Erro ao salvar", "error");
      return false;
    }
    return true;
  }

  function updateRow(name: string, patchData: Partial<ClientRow>) {
    setRows((prev) => prev.map((r) => (r.name === name ? { ...r, ...patchData } : r)));
  }

  async function handleChange(name: string, field: keyof ClientRow, value: string) {
    const prevRows = rows;
    updateRow(name, { [field]: value === "" ? null : value } as Partial<ClientRow>);
    const ok = await patch(name, { [field]: value === "" ? null : value });
    if (!ok) setRows(prevRows);
  }

  return (
    <div className="rounded-xl border border-surface-3">
      <table className="w-full text-sm table-fixed">
        <thead className="bg-surface-2 text-ink-dim text-xs uppercase tracking-wide">
          <tr>
            <th className="text-left px-2.5 py-3 font-medium w-[15%]">Cliente</th>
            <th className="text-left px-2.5 py-3 font-medium w-[8%]">Saúde</th>
            <th className="text-left px-2.5 py-3 font-medium w-[9%]">ERP</th>
            <th className="text-left px-2.5 py-3 font-medium w-[8%]">Status</th>
            <th className="text-left px-2.5 py-3 font-medium w-[11%]">Implantação Oxy</th>
            <th className="text-left px-2.5 py-3 font-medium w-[9%]">Importação</th>
            <th className="text-left px-2.5 py-3 font-medium w-[10%]">Últ. atualização</th>
            <th className="text-left px-2.5 py-3 font-medium w-[9%]">Tarefas abertas</th>
            <th className="text-left px-2.5 py-3 font-medium w-[17%]">Pendências na Oxy</th>
            <th className="px-2.5 py-3 font-medium w-[4%]"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-surface-3">
          {rows.map((c) => (
            <tr key={c.name} className="hover:bg-surface-2/50 transition-colors">
              <td className="px-2.5 py-2.5 overflow-hidden">
                <Link
                  href={`/clientes/${encodeURIComponent(c.name)}`}
                  title={c.name}
                  className="group flex items-center gap-1.5 text-ink hover:text-o2-green transition-colors min-w-0"
                >
                  <div className="w-6 h-6 rounded-lg bg-o2-green/10 flex items-center justify-center shrink-0">
                    <Building2 size={12} className="text-o2-green" />
                  </div>
                  <span className="font-medium truncate min-w-0 flex-1">{c.name}</span>
                  <ChevronRight size={14} className="text-ink-ghost group-hover:text-o2-green transition-colors shrink-0" />
                </Link>
              </td>
              <td className="px-2.5 py-2.5 overflow-hidden">
                <Select
                  value={c.healthStatus}
                  options={HEALTH_OPTIONS}
                  onChange={(v) => handleChange(c.name, "healthStatus", v)}
                />
              </td>
              <td className="px-2.5 py-2.5 overflow-hidden">
                <input
                  type="text"
                  defaultValue={c.erp ?? ""}
                  placeholder="Ex: Omie"
                  title={c.erp ?? ""}
                  onBlur={(e) => {
                    if (e.target.value !== (c.erp ?? "")) handleChange(c.name, "erp", e.target.value);
                  }}
                  className="w-full bg-transparent border border-transparent hover:border-surface-3 focus:border-o2-green/50 rounded-lg px-2 py-1.5 text-xs text-ink-soft placeholder:text-ink-ghost focus:outline-none transition-colors truncate"
                />
              </td>
              <td className="px-2.5 py-2.5 overflow-hidden">
                <Select
                  value={c.status}
                  options={STATUS_OPTIONS}
                  onChange={(v) => handleChange(c.name, "status", v)}
                />
              </td>
              <td className="px-2.5 py-2.5 overflow-hidden">
                <Select
                  value={c.oxyStage}
                  options={OXY_STAGE_OPTIONS}
                  onChange={(v) => handleChange(c.name, "oxyStage", v)}
                />
              </td>
              <td className="px-2.5 py-2.5 overflow-hidden">
                <Select
                  value={c.importType ?? ""}
                  options={IMPORT_TYPE_OPTIONS}
                  onChange={(v) => handleChange(c.name, "importType", v)}
                  plain
                />
              </td>
              <td className="px-2.5 py-2.5 overflow-hidden">
                <input
                  type="date"
                  value={toDateInputValue(c.lastDataUpdate)}
                  onChange={(e) => handleChange(c.name, "lastDataUpdate", e.target.value)}
                  className="w-full bg-surface border border-surface-3 rounded-lg px-2 py-1.5 text-xs text-ink-soft focus:outline-none focus:border-o2-green/50"
                />
              </td>
              <td className="px-2.5 py-2.5 overflow-hidden">
                {c.openTasks > 0 ? (
                  <Link
                    href={`/clientes/${encodeURIComponent(c.name)}`}
                    className="inline-block truncate max-w-full text-xs font-medium text-o2-green bg-o2-green/10 px-2 py-1 rounded-full hover:bg-o2-green/20 transition-colors"
                  >
                    {c.openTasks} em aberto
                  </Link>
                ) : (
                  <span className="text-xs text-ink-faint">Nenhuma</span>
                )}
              </td>
              <td className="px-2.5 py-2.5 overflow-hidden">
                <input
                  type="text"
                  defaultValue={c.oxyPendencies ?? ""}
                  placeholder="Ex: acesso ao ERP pendente"
                  title={c.oxyPendencies ?? ""}
                  onBlur={(e) => {
                    if (e.target.value !== (c.oxyPendencies ?? "")) handleChange(c.name, "oxyPendencies", e.target.value);
                  }}
                  className="w-full bg-transparent border border-transparent hover:border-surface-3 focus:border-o2-green/50 rounded-lg px-2 py-1.5 text-xs text-ink-soft placeholder:text-ink-ghost focus:outline-none transition-colors truncate"
                />
              </td>
              <td className="px-2.5 py-2.5 overflow-hidden">
                <button
                  onClick={() => setConfirmingDelete(c.name)}
                  className="p-1.5 text-ink-faint hover:text-red-400 transition-colors"
                  title="Excluir cliente"
                >
                  <Trash2 size={14} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {deleteTarget && (
        <div
          className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4"
          onClick={() => setConfirmingDelete(null)}
        >
          <div
            className="bg-panel border border-surface-3 rounded-2xl p-6 max-w-sm w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-sm font-semibold text-ink mb-3">Excluir cliente?</h3>
            <p className="text-xs text-ink-soft mb-5">
              Isso apaga <span className="text-ink font-medium">{deleteTarget.name}</span> e{" "}
              {deleteTarget.tasks} tarefa(s), {deleteTarget.meetings} reunião(ões), {deleteTarget.recaps} recap(s). Não pode ser desfeito.
            </p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setConfirmingDelete(null)}
                className="text-xs px-4 py-2 rounded-lg font-medium text-ink-dim hover:text-ink transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={() => deleteClient(deleteTarget)}
                disabled={deletingName === deleteTarget.name}
                className="bg-red-500/10 text-red-400 hover:bg-red-500/20 px-4 py-2 rounded-lg font-bold text-xs disabled:opacity-50"
              >
                {deletingName === deleteTarget.name ? "Excluindo..." : "Excluir definitivamente"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Select({
  value,
  options,
  onChange,
  plain,
}: {
  value: string;
  options: { value: string; label: string; className?: string }[];
  onChange: (v: string) => void;
  plain?: boolean;
}) {
  const current = options.find((o) => o.value === value);
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      title={current?.label}
      className={cn(
        "w-full max-w-full truncate text-xs font-medium rounded-full px-2.5 py-1 border-0 focus:outline-none focus:ring-1 focus:ring-o2-green/50 cursor-pointer appearance-none",
        plain ? "bg-surface-3 text-ink-soft" : current?.className ?? "bg-surface-3 text-ink-soft"
      )}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value} className="bg-panel text-ink">
          {o.label}
        </option>
      ))}
    </select>
  );
}
