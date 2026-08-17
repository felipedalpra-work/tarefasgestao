"use client";

import { useEffect, useRef, useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Globe, Sparkles, Users, CheckSquare, Building2, Loader2, X } from "lucide-react";
import { LogoIcon } from "./LogoIcon";
import { LoginFX, TiltCard } from "./LoginFX";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "onboarding-step";
const TYPING_DELAY_MS = 550;

type Props = { needsOnboarding: boolean; squadName: string; isAdmin: boolean };

type StepKey = "welcome" | "tasks" | "clients" | "recaps" | "team" | "assistant" | "google" | "slack" | "done";

// Roteiro do tour — texto fixo (não chama IA de verdade), só o estilo de
// apresentação (balões de chat, "digitando…") imita o assistente de verdade
// que já existe na plataforma (AiAssistant.tsx), pra dar a sensação de alguém
// conduzindo a introdução em vez de um formulário estático.
const SCRIPT: Record<StepKey, { icon: React.ElementType; title: string }> = {
  welcome: { icon: LogoIcon, title: "" },
  tasks: { icon: CheckSquare, title: "Tarefas & Kanban" },
  clients: { icon: Building2, title: "Clientes" },
  recaps: { icon: Sparkles, title: "Meet Recaps & Sugestões da IA" },
  team: { icon: Users, title: "Equipe" },
  assistant: { icon: LogoIcon, title: "Assistente de IA" },
  google: { icon: Globe, title: "Conta Google" },
  slack: { icon: Users, title: "Slack" },
  done: { icon: CheckCircle2, title: "Tudo pronto" },
};

// Wizard curto no 1o login — sempre pulável, nunca bloqueia o resto do app.
// Passos de squad-wide (Slack) só aparecem pro admin (só ele configura isso —
// ver a sub-aba Permissões em /equipe).
export function OnboardingGate({ needsOnboarding, squadName, isAdmin }: Props) {
  const router = useRouter();
  const steps: StepKey[] = isAdmin
    ? ["welcome", "tasks", "clients", "recaps", "team", "assistant", "google", "slack", "done"]
    : ["welcome", "tasks", "clients", "recaps", "team", "assistant", "google", "done"];

  const [dismissed, setDismissed] = useState(false);
  const [step, setStep] = useState(() => {
    if (typeof window === "undefined") return 0;
    const stored = Number(localStorage.getItem(STORAGE_KEY) || 0);
    return stored > 0 && stored < steps.length ? stored : 0;
  });
  const [typing, setTyping] = useState(false);
  const [googleConnected, setGoogleConnected] = useState(false);
  const [checkingGoogle, setCheckingGoogle] = useState(true);
  const [slackToken, setSlackToken] = useState("");
  const [slackSaving, setSlackSaving] = useState(false);
  const [slackSaved, setSlackSaved] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const current = steps[step];

  useEffect(() => {
    if (!needsOnboarding) return;
    fetch("/api/settings/google-status")
      .then((r) => r.json())
      .then((d) => setGoogleConnected(!!d.connected))
      .finally(() => setCheckingGoogle(false));
  }, [needsOnboarding]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [step, typing]);

  if (!needsOnboarding || dismissed) return null;

  function goTo(next: number) {
    localStorage.setItem(STORAGE_KEY, String(next));
    setTyping(true);
    setTimeout(() => {
      setStep(next);
      setTyping(false);
    }, TYPING_DELAY_MS);
  }

  async function finish() {
    localStorage.removeItem(STORAGE_KEY);
    setDismissed(true);
    await fetch("/api/users/me/onboarding", { method: "PATCH" });
  }

  async function connectGoogle() {
    localStorage.setItem(STORAGE_KEY, String(step));
    await signIn("google", { callbackUrl: window.location.href });
  }

  async function saveSlackToken() {
    if (!slackToken.trim()) { goTo(step + 1); return; }
    setSlackSaving(true);
    const res = await fetch("/api/settings/slack", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slack_bot_token: slackToken.trim() }),
    });
    setSlackSaving(false);
    if (res.ok) { setSlackSaved(true); goTo(step + 1); }
  }

  function renderBubbleBody(key: StepKey) {
    switch (key) {
      case "welcome":
        return (
          <p className="text-xs text-ink leading-relaxed">
            Oi! Eu sou o assistente do <strong className="text-ink-soft">{squadName}</strong> 👋 Vou te mostrar rapidinho como a plataforma funciona — pode pular a qualquer momento, tá?
          </p>
        );
      case "tasks":
        return (
          <p className="text-xs text-ink-mid leading-relaxed">
            Em <strong className="text-ink-soft">Tarefas</strong> e <strong className="text-ink-soft">Kanban</strong> você organiza o fluxo do squad — cada tarefa tem responsável, prazo, prioridade, e pode estar ligada a um cliente.
          </p>
        );
      case "clients":
        return (
          <p className="text-xs text-ink-mid leading-relaxed">
            Em <strong className="text-ink-soft">Clientes</strong> fica o histórico de cada conta: status, saúde (🟢🟡🔴), marcos de onboarding e o fechamento mensal.
          </p>
        );
      case "recaps":
        return (
          <p className="text-xs text-ink-mid leading-relaxed">
            Conectando o Gmail, toda reunião vira um <strong className="text-ink-soft">Meet Recap</strong> — e eu já sugiro tarefas a partir dele em <strong className="text-ink-soft">Sugestões da IA</strong>. Você só revisa e aceita.
          </p>
        );
      case "team":
        return (
          <p className="text-xs text-ink-mid leading-relaxed">
            Em <strong className="text-ink-soft">Equipe</strong> dá pra ver o organograma do squad, convidar gente nova e acompanhar quem já aceitou o convite.
          </p>
        );
      case "assistant":
        return (
          <p className="text-xs text-ink-mid leading-relaxed">
            E olha, esse sou eu! Fico ali no cantinho da tela, sempre disponível — pergunta sobre tarefa atrasada, cliente em risco, o que precisar.
          </p>
        );
      case "google":
        return (
          <div>
            <p className="text-xs text-ink-mid leading-relaxed mb-3">
              Agora só falta conectar sua conta Google — assim eu sincronizo Gmail (Meet Recaps + tarefas por e-mail) e Google Calendar automaticamente. Dá pra fazer isso depois também, em Configurações.
            </p>
            {checkingGoogle ? (
              <div className="h-10 bg-surface rounded-lg animate-pulse" />
            ) : googleConnected ? (
              <div className="flex items-center gap-2 text-xs text-o2-green bg-o2-green/10 px-3 py-2.5 rounded-lg">
                <CheckCircle2 size={14} />
                Conta Google conectada
              </div>
            ) : (
              <button
                onClick={connectGoogle}
                className="w-full flex items-center justify-center gap-2 bg-o2-green text-bg font-bold py-2.5 px-4 rounded-lg hover:bg-o2-green-bright transition-all text-xs"
              >
                <Globe size={14} />
                Conectar conta Google
              </button>
            )}
          </div>
        );
      case "slack":
        return (
          <div>
            <p className="text-xs text-ink-mid leading-relaxed mb-3">
              Opcional — cole o Bot Token do Slack do squad pra receber avisos de tarefa por lá. Dá pra configurar (e mapear cada pessoa) depois em Configurações → Slack.
            </p>
            <input
              type="password"
              placeholder="xoxb-00000000000-... (opcional)"
              value={slackToken}
              onChange={(e) => setSlackToken(e.target.value)}
              className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-xs text-ink placeholder:text-ink-ghost focus:outline-none focus:border-o2-green/50"
            />
            {slackSaved && <p className="text-xs text-o2-green mt-2">Token salvo!</p>}
          </div>
        );
      case "done":
        return (
          <p className="text-xs text-ink-mid leading-relaxed">
            Prontinho! {isAdmin ? "Já dá pra convidar o resto do time em Equipe." : "Já dá pra começar a usar a plataforma."}
          </p>
        );
    }
  }

  const revealed = steps.slice(0, step + 1);

  return (
    <div className="fixed inset-0 z-[60] bg-bg flex items-center justify-center px-4">
      <LoginFX />

      <div className="relative w-full max-w-md">
        <div className="flex items-center justify-center gap-1.5 mb-6">
          {steps.map((s, i) => (
            <div
              key={s}
              className={cn(
                "h-1.5 rounded-full transition-all duration-300",
                i === step ? "w-6 bg-o2-green" : i < step ? "w-1.5 bg-o2-green/50" : "w-1.5 bg-surface-3"
              )}
            />
          ))}
        </div>

        <TiltCard className="animate-login-enter">
          <div className="bg-surface border border-surface-3 rounded-2xl shadow-2xl flex flex-col overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-surface-3 shrink-0">
              <LogoIcon className="w-5 h-5 text-o2-green" />
              <span className="text-sm font-semibold text-ink">Assistente O2</span>
              <span className="text-xs text-ink-faint ml-auto">te apresentando a plataforma</span>
            </div>

            <div ref={scrollRef} className="px-4 py-4 space-y-3 max-h-[360px] overflow-y-auto">
              {revealed.map((key) => {
                const { icon: Icon, title } = SCRIPT[key];
                return (
                  <div key={key} className="flex justify-start animate-fade-in">
                    <div className="max-w-[90%] bg-surface-2 rounded-xl px-3 py-2.5">
                      {title && (
                        <div className="flex items-center gap-1.5 mb-1">
                          <Icon size={12} className="text-o2-green shrink-0" />
                          <span className="text-xs font-semibold text-ink">{title}</span>
                        </div>
                      )}
                      {renderBubbleBody(key)}
                    </div>
                  </div>
                );
              })}

              {typing && (
                <div className="flex justify-start animate-fade-in">
                  <div className="bg-surface-2 rounded-xl px-3 py-2 flex items-center gap-1.5 text-ink-faint">
                    <Loader2 size={12} className="animate-spin" />
                    <span className="text-xs">digitando…</span>
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between px-4 py-3 border-t border-surface-3 shrink-0">
              {current === "done" ? (
                <span />
              ) : (
                <button onClick={finish} className="flex items-center gap-1 text-xs text-ink-faint hover:text-ink-mid transition-colors">
                  <X size={12} />
                  Pular tudo
                </button>
              )}
              {current === "done" ? (
                <button
                  onClick={async () => { await finish(); if (isAdmin) router.push("/equipe"); }}
                  className="text-xs font-bold text-bg bg-o2-green px-4 py-2 rounded-lg hover:bg-o2-green-bright transition-all ml-auto"
                >
                  {isAdmin ? "Convidar time" : "Começar a usar"}
                </button>
              ) : current === "slack" ? (
                <button
                  onClick={saveSlackToken}
                  disabled={slackSaving || typing}
                  className="text-xs font-medium text-o2-green hover:underline disabled:opacity-50"
                >
                  {slackSaving ? "Salvando..." : slackToken.trim() ? "Salvar e continuar →" : "Pular →"}
                </button>
              ) : (
                <button onClick={() => goTo(step + 1)} disabled={typing} className="text-xs font-medium text-o2-green hover:underline disabled:opacity-50">
                  {current === "welcome" ? "Começar →" : "Continuar →"}
                </button>
              )}
            </div>
          </div>
        </TiltCard>
      </div>
    </div>
  );
}
