"use client";

import { useEffect, useRef, useState } from "react";
import { Send, X, Loader2, RotateCcw, Check, AlertTriangle, Mic, MicOff } from "lucide-react";
import { LogoIcon } from "./LogoIcon";
import { cn } from "@/lib/utils";

// Ditado por voz via reconhecimento de fala do NAVEGADOR (Web Speech API) — sem custo
// de IA e sem depender da cota da Groq, que já estourou mais de uma vez só testando o
// assistente por texto hoje. Suporte real é Chrome/Edge (prefixo `webkit` inclusive no
// Edge baseado em Chromium); Firefox não implementa a API e Safari é instável — por isso
// o botão de microfone só aparece quando a API existe no navegador de quem abrir.
type SpeechRecognitionResultLike = { transcript: string };
type SpeechRecognitionEventLike = { results: ArrayLike<ArrayLike<SpeechRecognitionResultLike>> };
type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((e: SpeechRecognitionEventLike) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
};

function getSpeechRecognition(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: new () => SpeechRecognitionLike; webkitSpeechRecognition?: new () => SpeechRecognitionLike };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

type Message = { role: "user" | "assistant"; content: string };

// Alteração que o assistente preparou numa tarefa que já existe e que só acontece
// quando a pessoa clica em Confirmar. O que o assistente erra com mais chance não é a
// ação, é o ALVO — por isso o card mostra a tarefa resolvida antes de mexer nela.
type PendingAction = { id: string; summary: string };

const SUGGESTIONS = ["O que está atrasado?", "Quais clientes estão com saúde vermelha?", "Tem sugestão da IA parada?"];

export function AiAssistant() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [resolvingAction, setResolvingAction] = useState(false);
  const [listening, setListening] = useState(false);
  // computado false no servidor e na primeira renderização do cliente (evita
  // divergência de hidratação) — vira true depois do mount se o navegador suportar
  const [speechSupported, setSpeechSupported] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const dictationBaseRef = useRef(""); // texto que já estava no campo antes de começar a ditar

  // carrega a memória da pessoa (não some ao recarregar a página) na primeira vez que o painel abre
  useEffect(() => {
    if (!open || historyLoaded) return;
    setHistoryLoaded(true);
    setSpeechSupported(getSpeechRecognition() !== null);
    fetch("/api/assistant/messages")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data.messages)) setMessages(data.messages);
        // ação pendente sobrevive ao F5 — senão o botão sumiria no meio da alteração
        if (data.pendingAction) setPendingAction(data.pendingAction);
      })
      .catch(() => {});
  }, [open, historyLoaded]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 100);
  }, [open]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  // fecha o painel com o microfone ligado não pode deixar o navegador escutando escondido
  useEffect(() => {
    if (!open) recognitionRef.current?.stop();
  }, [open]);

  useEffect(() => () => { recognitionRef.current?.stop(); }, []);

  function startListening() {
    const SpeechRecognitionCtor = getSpeechRecognition();
    if (!SpeechRecognitionCtor || listening) return;
    setError(null);
    const recognition = new SpeechRecognitionCtor();
    recognition.lang = "pt-BR";
    recognition.interimResults = true;
    recognition.continuous = true;
    dictationBaseRef.current = input.trim();

    recognition.onresult = (e) => {
      // `results` acumula tudo desde o início da sessão de ditado (final + o trecho
      // ainda sendo reconhecido) — reconstruir inteiro a cada evento é mais simples e
      // seguro do que tentar rastrear só o que é novo, e nunca duplica texto
      let spoken = "";
      for (let i = 0; i < e.results.length; i++) spoken += e.results[i]?.[0]?.transcript ?? "";
      setInput((dictationBaseRef.current ? dictationBaseRef.current + " " : "") + spoken);
    };
    recognition.onerror = (e) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        setError("Permissão de microfone negada — libere o microfone pro site e tente de novo.");
      } else if (e.error !== "no-speech" && e.error !== "aborted") {
        setError("Não consegui captar o áudio agora.");
      }
    };
    recognition.onend = () => setListening(false);

    recognitionRef.current = recognition;
    recognition.start();
    setListening(true);
  }

  function stopListening() {
    recognitionRef.current?.stop();
    setListening(false);
  }

  async function send(text?: string) {
    const content = (text ?? input).trim();
    if (!content || loading) return;
    stopListening();
    setMessages((prev) => [...prev, { role: "user", content }]);
    setInput("");
    setError(null);
    setPendingAction(null);
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
        if (data.pendingAction) setPendingAction(data.pendingAction);
      }
    } catch {
      setError("Não consegui falar com o assistente agora.");
    } finally {
      setLoading(false);
    }
  }

  // Confirma ou descarta a alteração pendente. É esta chamada que muda a tarefa de
  // fato — o chat só tinha registrado a intenção.
  async function resolveAction(confirm: boolean) {
    if (!pendingAction || resolvingAction) return;
    setResolvingAction(true);
    try {
      const res = await fetch(`/api/assistant/actions/${pendingAction.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Não consegui concluir essa ação.");
      } else {
        setMessages((prev) => [...prev, { role: "assistant", content: data.reply }]);
        setPendingAction(null);
      }
    } catch {
      setError("Não consegui falar com o assistente agora.");
    } finally {
      setResolvingAction(false);
    }
  }

  async function resetConversation() {
    setMessages([]);
    setError(null);
    setPendingAction(null);
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

            {pendingAction && (
              <div className="flex justify-start">
                <div className="max-w-[92%] w-full bg-surface-2 border border-yellow-500/30 rounded-xl p-3">
                  <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-yellow-400 mb-1.5">
                    <AlertTriangle size={11} />
                    Confirma esta alteração?
                  </p>
                  <p className="text-xs text-ink leading-relaxed">{pendingAction.summary}</p>
                  <div className="flex items-center gap-2 mt-2.5">
                    <button
                      onClick={() => resolveAction(true)}
                      disabled={resolvingAction}
                      className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg bg-o2-green text-bg font-semibold hover:bg-o2-green-bright disabled:opacity-50 transition-colors"
                    >
                      <Check size={13} />
                      {resolvingAction ? "Aplicando…" : "Confirmar"}
                    </button>
                    <button
                      onClick={() => resolveAction(false)}
                      disabled={resolvingAction}
                      className="text-xs px-3 py-1.5 rounded-lg text-ink-mid hover:text-ink disabled:opacity-50 transition-colors"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              </div>
            )}

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
              placeholder={listening ? "Ouvindo…" : "Pergunte alguma coisa…"}
              rows={1}
              className="flex-1 bg-surface-2 border border-surface-3 rounded-lg px-3 py-2 text-xs text-ink placeholder:text-ink-ghost focus:outline-none focus:border-o2-green/50 resize-none max-h-24"
            />
            {speechSupported && (
              <button
                onClick={() => (listening ? stopListening() : startListening())}
                disabled={loading}
                title={listening ? "Parar ditado" : "Falar em vez de digitar"}
                className={cn(
                  "p-2 rounded-lg transition-all disabled:opacity-50 shrink-0",
                  listening ? "bg-red-500/15 text-red-400 animate-pulse" : "bg-surface-2 text-ink-faint hover:text-ink"
                )}
              >
                {listening ? <MicOff size={14} /> : <Mic size={14} />}
              </button>
            )}
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
