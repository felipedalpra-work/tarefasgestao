"use client";

import { useState } from "react";
import { Mail, RefreshCw, Send, AlertTriangle, Link as LinkIcon, Eye, EyeOff, Settings2 } from "lucide-react";
import { toast } from "./Toaster";
import { AutoGrowTextarea } from "./AutoGrowTextarea";
import { parseEmailList } from "@/lib/utils";
import { buildWeeklyClientEmailHtml } from "@/lib/email-templates";
import { taskResponsibles } from "@/lib/task-assignees";
import type { TaskListItem } from "@/types/task";

type EmailTask = TaskListItem & { isNew: boolean };

// Mesmo resolvedor de responsável já usado no resto da plataforma (Kanban, Tarefas, Semana)
// — cobre tarefa em conjunto e responsável = cliente. Responsável que é alguém do squad
// (não é o cliente) vira só "O2" — e-mail vai pro cliente, não faz sentido expor nome de
// quem da O2 ficou com a tarefa.
function responsibleLabel(t: EmailTask): string | null {
  const labels = taskResponsibles(t)
    .map((r) => (r.isClient ? r.name : "O2"))
    .filter((n): n is string => !!n);
  const unique = [...new Set(labels)];
  return unique.length > 0 ? unique.join(", ") : null;
}

function taskLine(t: EmailTask): string {
  const responsavel = responsibleLabel(t);
  return `• ${t.title}${responsavel ? ` — responsável: ${responsavel}` : ""}`;
}

function renderBody(template: string, tasks: EmailTask[]): string {
  const list = tasks.length > 0 ? tasks.map(taskLine).join("\n") : "(nenhuma tarefa selecionada)";
  return template.replace("{{tarefas}}", list);
}

// Aba "E-mail" da Revisão Semanal — monta e ENVIA DE VERDADE (não é rascunho) o e-mail de
// pendências pro cliente, pelo Gmail de quem está logado (ver sendWeeklyClientEmail em
// src/lib/gmail-draft.ts). Tarefas vêm todas pré-selecionadas; desmarcar não regenera o
// corpo sozinho — só o botão "Recarregar tarefas no texto" faz isso, de propósito (não
// clobbera o que a pessoa já editou à toa). O componente espera ser remontado (via `key`)
// toda vez que o cliente muda — não tenta resetar o próprio estado sozinho.
export function WeeklyEmailTab({
  clientName,
  clientEmail,
  tasksOpen,
  emailTemplate,
  clientEmailTemplate,
}: {
  clientName: string;
  clientEmail: string | null;
  tasksOpen: EmailTask[];
  emailTemplate: string; // modelo padrão do squad (Configurações) — fallback
  clientEmailTemplate: string | null; // modelo próprio desse cliente, quando existir — vence o do squad
}) {
  const clientEmails = parseEmailList(clientEmail);
  // modelo salvo desse cliente — local porque essa tela não é dona do dado (vem da Revisão
  // Semanal); atualizado otimisticamente ao salvar/restaurar, sem precisar recarregar a
  // revisão inteira.
  const [savedClientTemplate, setSavedClientTemplate] = useState(clientEmailTemplate);
  const effectiveTemplate = savedClientTemplate ?? emailTemplate;

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set(tasksOpen.map((t) => t.id)));
  const [subject, setSubject] = useState(`Pendências em aberto — ${clientName}`);
  const [bodyText, setBodyText] = useState(() => renderBody(effectiveTemplate, tasksOpen));
  const [confirming, setConfirming] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  const [editingTemplate, setEditingTemplate] = useState(false);
  const [templateDraft, setTemplateDraft] = useState(effectiveTemplate);
  const [savingTemplate, setSavingTemplate] = useState(false);

  function toggleTask(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function reloadTasksIntoBody() {
    const selected = tasksOpen.filter((t) => selectedIds.has(t.id));
    setBodyText(renderBody(effectiveTemplate, selected));
    toast("Texto recarregado a partir do modelo", "success");
  }

  async function saveClientTemplate() {
    if (!templateDraft.trim()) return;
    setSavingTemplate(true);
    const res = await fetch(`/api/clients/${encodeURIComponent(clientName)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ emailTemplate: templateDraft }),
    });
    setSavingTemplate(false);
    if (res.ok) {
      setSavedClientTemplate(templateDraft);
      toast("Modelo deste cliente salvo", "success");
    } else {
      toast("Erro ao salvar o modelo", "error");
    }
  }

  async function resetToSquadTemplate() {
    setSavingTemplate(true);
    const res = await fetch(`/api/clients/${encodeURIComponent(clientName)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ emailTemplate: null }),
    });
    setSavingTemplate(false);
    if (res.ok) {
      setSavedClientTemplate(null);
      setTemplateDraft(emailTemplate);
      toast("Voltou a usar o modelo padrão do squad", "success");
    } else {
      toast("Erro ao restaurar o modelo padrão", "error");
    }
  }

  async function handleSend() {
    if (clientEmails.length === 0) return;
    setSending(true);
    const res = await fetch(`/api/clients/${encodeURIComponent(clientName)}/send-weekly-email`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subject, bodyText }),
    });
    const data = await res.json().catch(() => ({}));
    setSending(false);
    setConfirming(false);
    if (res.ok) {
      setSent(true);
      toast(`E-mail enviado para ${clientEmails.join(", ")}`, "success");
    } else {
      toast(data.error || "Erro ao enviar o e-mail", "error");
    }
  }

  if (clientEmails.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
        <Mail size={28} className="text-border" />
        <p className="text-ink-mid text-sm">Esse cliente ainda não tem e-mail cadastrado.</p>
        <a
          href={`/clientes/${encodeURIComponent(clientName)}`}
          className="flex items-center gap-1.5 text-xs text-o2-green hover:text-o2-green-bright"
        >
          <LinkIcon size={12} /> Cadastrar na aba Notas
        </a>
      </div>
    );
  }

  return (
    <section className="mb-8 space-y-4">
      {tasksOpen.length === 0 ? (
        <p className="text-sm text-ink-faint">Esse cliente não tem tarefas em aberto — o e-mail sairia sem lista de pendências.</p>
      ) : (
        <div>
          <label className="text-xs font-medium text-ink-mid uppercase tracking-wide block mb-2">
            Tarefas no e-mail ({selectedIds.size} de {tasksOpen.length})
          </label>
          <div className="space-y-1.5 max-h-64 overflow-y-auto">
            {tasksOpen.map((t) => {
              const responsavel = responsibleLabel(t);
              return (
                <label
                  key={t.id}
                  className="flex items-center gap-2.5 bg-surface-2 border border-surface-3 rounded-lg px-3 py-2 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={selectedIds.has(t.id)}
                    onChange={() => toggleTask(t.id)}
                    className="accent-o2-green"
                  />
                  <span className="text-sm text-ink flex-1">{t.title}</span>
                  {responsavel && <span className="text-xs text-ink-faint shrink-0">{responsavel}</span>}
                </label>
              );
            })}
          </div>
          <button
            onClick={reloadTasksIntoBody}
            className="mt-2 flex items-center gap-1.5 text-xs text-ink-mid hover:text-ink"
          >
            <RefreshCw size={12} /> Recarregar tarefas no texto
          </button>
        </div>
      )}

      <div className="border border-surface-3 rounded-xl overflow-hidden">
        <button
          onClick={() => setEditingTemplate((v) => !v)}
          className="w-full flex items-center justify-between gap-2 px-4 py-2.5 text-xs font-medium text-ink-mid hover:text-ink bg-surface-2"
        >
          <span className="flex items-center gap-1.5">
            <Settings2 size={13} /> Editar modelo deste cliente
            {savedClientTemplate && <span className="text-[10px] bg-o2-green/15 text-o2-green rounded-full px-1.5 py-0.5">personalizado</span>}
          </span>
          <span>{editingTemplate ? "▾" : "▸"}</span>
        </button>
        {editingTemplate && (
          <div className="p-3 space-y-2 bg-surface-2/50">
            <p className="text-xs text-ink-faint">
              Modelo próprio desse cliente, usado como ponto de partida sempre que a aba E-mail abrir pra ele. O token{" "}
              <code className="bg-surface px-1 rounded">{"{{tarefas}}"}</code> vira a lista das tarefas marcadas.
            </p>
            <AutoGrowTextarea
              value={templateDraft}
              onChange={(e) => setTemplateDraft(e.target.value)}
              rows={6}
              maxHeight={320}
              className="w-full bg-surface border border-surface-3 rounded-lg px-3 py-2.5 text-sm text-ink focus:outline-none focus:border-o2-green/50 font-mono"
            />
            <div className="flex items-center gap-2">
              <button
                onClick={saveClientTemplate}
                disabled={savingTemplate}
                className="text-xs font-medium bg-o2-green text-bg px-3 py-1.5 rounded-lg hover:bg-o2-green-bright transition-all disabled:opacity-50"
              >
                {savingTemplate ? "Salvando…" : "Salvar modelo deste cliente"}
              </button>
              {savedClientTemplate && (
                <button
                  onClick={resetToSquadTemplate}
                  disabled={savingTemplate}
                  className="text-xs text-ink-mid hover:text-ink"
                >
                  Usar modelo padrão do squad
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      <div>
        <label className="text-xs font-medium text-ink-mid uppercase tracking-wide block mb-1.5">Assunto</label>
        <input
          type="text"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          className="w-full bg-surface-2 border border-surface-3 rounded-xl px-4 py-2.5 text-sm text-ink focus:outline-none focus:border-o2-green/50"
        />
      </div>

      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className="text-xs font-medium text-ink-mid uppercase tracking-wide">Corpo do e-mail</label>
          <button
            onClick={() => setShowPreview((v) => !v)}
            className="flex items-center gap-1.5 text-xs text-ink-mid hover:text-ink"
          >
            {showPreview ? <EyeOff size={12} /> : <Eye size={12} />}
            {showPreview ? "Ocultar pré-visualização" : "Pré-visualizar"}
          </button>
        </div>
        <AutoGrowTextarea
          value={bodyText}
          onChange={(e) => setBodyText(e.target.value)}
          rows={10}
          maxHeight={480}
          className="w-full bg-surface-2 border border-surface-3 rounded-xl px-4 py-3 text-sm text-ink focus:outline-none focus:border-o2-green/50 font-mono"
        />
        {showPreview && (
          <div className="mt-2 border border-surface-3 rounded-xl overflow-hidden bg-white">
            <iframe
              title="Pré-visualização do e-mail"
              srcDoc={buildWeeklyClientEmailHtml({ subject, bodyText })}
              className="w-full h-[600px]"
              sandbox=""
            />
          </div>
        )}
      </div>

      {!confirming ? (
        <button
          onClick={() => setConfirming(true)}
          disabled={sending || sent}
          className="flex items-center gap-2 bg-o2-green text-bg px-4 py-2.5 rounded-xl font-bold text-sm hover:bg-o2-green-bright transition-all disabled:opacity-50"
        >
          <Send size={14} />
          {sent ? "E-mail enviado" : "Enviar e-mail"}
        </button>
      ) : (
        <div className="flex items-center gap-3 bg-amber-400/10 border border-amber-400/20 rounded-xl px-4 py-3">
          <AlertTriangle size={16} className="text-amber-300 shrink-0" />
          <p className="text-sm text-ink flex-1">
            Enviar de verdade para <strong>{clientEmails.join(", ")}</strong> (com o squad em cópia)?
          </p>
          <button
            onClick={() => setConfirming(false)}
            className="text-xs text-ink-mid hover:text-ink px-3 py-1.5"
          >
            Cancelar
          </button>
          <button
            onClick={handleSend}
            disabled={sending}
            className="flex items-center gap-1.5 bg-o2-green text-bg px-3.5 py-1.5 rounded-lg font-bold text-xs hover:bg-o2-green-bright transition-all disabled:opacity-50"
          >
            {sending ? "Enviando…" : "Confirmar envio"}
          </button>
        </div>
      )}
    </section>
  );
}
