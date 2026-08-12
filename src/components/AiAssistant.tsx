"use client";

import { useEffect, useRef, useState } from "react";
import { Send, X, Loader2, RotateCcw } from "lucide-react";
import { LogoIcon } from "./LogoIcon";
import { cn } from "@/lib/utils";

type Message = { role: "user" | "assistant"; content: string };

const SUGGESTIONS = ["O que está atrasado?", "Quais clientes estão com saúde vermelha?", "Tem sugestão da IA parada?"];

export function AiAssistant() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // carrega a memória da pessoa (não some ao recarregar a página) na primeira vez que o painel abre
  useEffect(() => {
    if (!open || historyLoaded) return;
    setHistoryLoaded(true);
    fetch("/api/assistant/messages")
      .then((r) => r.json())
      .then((data) => { if (Array.isArray(data.messages)) setMessages(data.messages); })
      .catch(() => {});
  }, [open, historyLoaded]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 100);
  }, [open]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  async function send(text?: string) {
    const content = (text ?? input).trim();
    if (!content || loading) return;
    setMessages((prev) => [...prev, { role: "user", content }]);
    setInput("");
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/assistant/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: content }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Erro ao consultar o assistente.");
      } else {
        setMessages((prev) => [...prev, { role: "assistant", content: data.reply }]);
      }
    } catch {
      setError("Não consegui falar com o assistente agora.");
    } finally {
      setLoading(false);
    }
  }

  async function resetConversation() {
    setMessages([]);
    setError(null);
    await fetch("/api/assistant/messages", { method: "DELETE" }).catch(() => {});
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  return (
    <>
      {open && (
        <div className="fixed bottom-24 right-5 z-50 w-[380px] max-w-[calc(100vw-2.5rem)] h-[560px] max-h-[calc(100vh-8rem)] bg-surface border border-surface-3 rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-slide-in-up">
          <div className="flex items-center justify-between px-4 py-3 border-b border-surface-3 shrink-0">
            <div className="flex items-center gap-2">
              <LogoIcon className="w-5 h-5 text-o2-green" />
              <span className="text-sm font-semibold text-ink">Assistente O2</span>
            </div>
            <div className="flex items-center gap-1">
              {messages.length > 0 && (
                <button onClick={resetConversation} title="Nova conversa" className="text-ink-faint hover:text-ink p-1">
                  <RotateCcw size={14} />
                </button>
              )}
              <button onClick={() => setOpen(false)} className="text-ink-faint hover:text-ink p-1">
                <X size={16} />
              </button>
            </div>
          </div>

          <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
            {messages.length === 0 && (
              <div className="h-full flex flex-col items-center justify-center text-center gap-3 py-6">
                <LogoIcon className="w-8 h-8 text-border" />
                <p className="text-xs text-ink-faint px-4">
                  Pergunte sobre tarefas, clientes, tratativas ou reuniões — eu consulto os dados reais da plataforma.
                </p>
                <div className="flex flex-col gap-1.5 w-full">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      onClick={() => send(s)}
                      className="text-xs text-left px-3 py-2 rounded-lg bg-surface-2 text-ink-mid hover:text-ink hover:bg-surface-3 transition-colors"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((m, i) => (
              <div key={i} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
                <div
                  className={cn(
                    "max-w-[85%] rounded-xl px-3 py-2 text-xs leading-relaxed whitespace-pre-wrap",
                    m.role === "user" ? "bg-o2-green text-bg font-medium" : "bg-surface-2 text-ink"
                  )}
                >
                  {m.content}
                </div>
              </div>
            ))}

            {loading && (
              <div className="flex justify-start">
                <div className="bg-surface-2 rounded-xl px-3 py-2 flex items-center gap-1.5 text-ink-faint">
                  <Loader2 size={12} className="animate-spin" />
                  <span className="text-xs">Consultando…</span>
                </div>
              </div>
            )}

            {error && <p className="text-xs text-red-400 text-center">{error}</p>}
          </div>

          <div className="p-3 border-t border-surface-3 shrink-0 flex items-end gap-2">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Pergunte alguma coisa…"
              rows={1}
              className="flex-1 bg-surface-2 border border-surface-3 rounded-lg px-3 py-2 text-xs text-ink placeholder:text-ink-ghost focus:outline-none focus:border-o2-green/50 resize-none max-h-24"
            />
            <button
              onClick={() => send()}
              disabled={loading || !input.trim()}
              className="bg-o2-green text-bg p-2 rounded-lg hover:bg-o2-green-bright transition-all disabled:opacity-50 shrink-0"
            >
              <Send size={14} />
            </button>
          </div>
        </div>
      )}

      <button
        onClick={() => setOpen((v) => !v)}
        className="fixed bottom-5 right-5 z-50 w-14 h-14 rounded-full bg-surface border border-surface-3 shadow-2xl flex items-center justify-center text-o2-green hover:border-o2-green/50 hover:scale-105 transition-all"
        title="Assistente O2"
      >
        {open ? <X size={20} /> : <LogoIcon className="w-7 h-7" />}
      </button>
    </>
  );
}
