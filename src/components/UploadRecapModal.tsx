"use client";

import { useState } from "react";
import { Upload, X, FileText, AlertTriangle } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

export function UploadRecapModal({
  onCancel,
  onUploaded,
}: {
  onCancel: () => void;
  onUploaded: (result: { recapId: string; count: number }) => void;
}) {
  const [subject, setSubject] = useState("");
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [duplicate, setDuplicate] = useState<{ id: string; subject: string; createdAt: string; reason: string } | null>(null);

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => setText(String(reader.result ?? ""));
    reader.readAsText(file, "utf-8");
    setSubject((prev) => prev || file.name.replace(/\.[^.]+$/, ""));
  }

  async function submit(force = false) {
    if (!subject.trim() || text.trim().length < 20) return;
    setSubmitting(true);
    setError(null);
    const res = await fetch("/api/recaps/upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subject, body: text, force }),
    });
    const data = await res.json();
    setSubmitting(false);
    if (res.status === 409 && data.duplicate) {
      setDuplicate(data.duplicate);
      return;
    }
    if (!res.ok) {
      setError(data.error || "Erro ao enviar a transcrição.");
      return;
    }
    onUploaded({ recapId: data.recapId, count: data.count });
  }

  const tooShort = text.trim().length > 0 && text.trim().length < 20;

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 animate-fade-in" onClick={onCancel}>
      <div
        className="bg-panel border border-surface-3 rounded-2xl p-6 max-w-lg w-full animate-slide-in-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-ink flex items-center gap-2">
            <Upload size={16} className="text-o2-green" />
            Enviar transcrição
          </h3>
          <button onClick={onCancel} className="text-ink-faint hover:text-ink">
            <X size={16} />
          </button>
        </div>
        <p className="text-xs text-ink-dim mb-4">
          Pra reuniões sem Meet Recap por e-mail — cole ou envie o arquivo da transcrição e a IA já extrai as tarefas, igual acontece com os recaps do Gmail.
        </p>

        <div className="space-y-3">
          <div>
            <label className="text-xs text-ink-dim block mb-1">Título da reunião</label>
            <input
              value={subject}
              onChange={(e) => { setSubject(e.target.value); setDuplicate(null); }}
              placeholder='ex.: "O2 Inc. & Zé do Flor | Semanal"'
              className="w-full bg-surface border border-surface-3 rounded-xl px-3 py-2 text-sm text-ink placeholder:text-ink-ghost focus:outline-none focus:border-o2-green/50"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs text-ink-dim">Transcrição</label>
              <label className="flex items-center gap-1.5 text-xs text-o2-green hover:text-o2-green-bright cursor-pointer transition-colors">
                <FileText size={12} />
                {fileName ? "Trocar arquivo" : "Escolher arquivo (.txt)"}
                <input type="file" accept=".txt,text/plain" onChange={handleFile} className="hidden" />
              </label>
            </div>
            {fileName && <p className="text-[11px] text-ink-faint mb-1.5">{fileName}</p>}
            <textarea
              value={text}
              onChange={(e) => { setText(e.target.value); setFileName(null); setDuplicate(null); }}
              placeholder="Cole aqui o texto da transcrição, ou escolha um arquivo acima…"
              rows={8}
              className="w-full bg-surface border border-surface-3 rounded-xl px-3 py-2 text-xs text-ink placeholder:text-ink-ghost focus:outline-none focus:border-o2-green/50 resize-none font-mono"
            />
            {tooShort && <p className="text-[11px] text-yellow-400 mt-1">Muito curto — a IA precisa de mais conteúdo pra identificar tarefas.</p>}
          </div>
        </div>

        {error && <p className="text-xs text-red-400 mt-3">{error}</p>}

        {duplicate && (
          <div className="flex items-start gap-2.5 bg-yellow-500/10 border border-yellow-500/20 rounded-lg px-3 py-2.5 mt-3">
            <AlertTriangle size={14} className="text-yellow-400 shrink-0 mt-0.5" />
            <div className="flex-1 text-xs text-ink-dim">
              <p>
                Parece duplicada de <span className="text-ink font-medium">&quot;{duplicate.subject}&quot;</span>, enviada em{" "}
                {format(new Date(duplicate.createdAt), "dd 'de' MMM", { locale: ptBR })} ({duplicate.reason}).
              </p>
              <button
                onClick={() => submit(true)}
                disabled={submitting}
                className="text-yellow-400 hover:text-yellow-300 font-medium mt-1.5 transition-colors disabled:opacity-50"
              >
                {submitting ? "Enviando…" : "Enviar mesmo assim"}
              </button>
            </div>
          </div>
        )}

        <div className="flex gap-2 justify-end mt-5">
          <button
            onClick={onCancel}
            disabled={submitting}
            className="text-xs px-4 py-2 rounded-lg font-medium text-ink-dim hover:text-ink transition-all disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            onClick={() => submit(false)}
            disabled={submitting || !subject.trim() || text.trim().length < 20 || !!duplicate}
            className="flex items-center gap-1.5 bg-o2-green text-bg px-4 py-2 rounded-lg font-bold text-xs hover:bg-o2-green-bright transition-all disabled:opacity-50"
          >
            <Upload size={13} />
            {submitting ? "Processando…" : "Enviar e gerar tarefas"}
          </button>
        </div>
      </div>
    </div>
  );
}
