"use client";

import { useEffect, useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Globe, Sparkles, Users } from "lucide-react";
import { LogoIcon } from "./LogoIcon";
import { LoginFX, TiltCard } from "./LoginFX";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "onboarding-step";

type Props = { needsOnboarding: boolean; squadName: string; isAdmin: boolean };

// Wizard curto no 1o login — sempre pulável, nunca bloqueia o resto do app.
// Passos de squad-wide (Slack/Meet Recap) só aparecem pro admin (só ele
// configura isso — ver a sub-aba Permissões em /equipe).
export function OnboardingGate({ needsOnboarding, squadName, isAdmin }: Props) {
  const router = useRouter();
  const steps = isAdmin ? ["welcome", "google", "slack", "meetrecap", "done"] : ["welcome", "google", "done"];

  const [dismissed, setDismissed] = useState(false);
  const [step, setStep] = useState(() => {
    if (typeof window === "undefined") return 0;
    const stored = Number(localStorage.getItem(STORAGE_KEY) || 0);
    return stored > 0 && stored < steps.length ? stored : 0;
  });
  const [googleConnected, setGoogleConnected] = useState(false);
  const [checkingGoogle, setCheckingGoogle] = useState(true);
  const [slackToken, setSlackToken] = useState("");
  const [slackSaving, setSlackSaving] = useState(false);
  const [slackSaved, setSlackSaved] = useState(false);

  const current = steps[step];

  useEffect(() => {
    if (!needsOnboarding) return;
    fetch("/api/settings/google-status")
      .then((r) => r.json())
      .then((d) => setGoogleConnected(!!d.connected))
      .finally(() => setCheckingGoogle(false));
  }, [needsOnboarding]);

  if (!needsOnboarding || dismissed) return null;

  function goTo(next: number) {
    localStorage.setItem(STORAGE_KEY, String(next));
    setStep(next);
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
    if (res.ok) { setSlackSaved(true); setTimeout(() => goTo(step + 1), 600); }
  }

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
          <div className="bg-surface border border-surface-3 rounded-2xl p-8 shadow-2xl min-h-[280px] flex flex-col">
            <div className="flex-1">
              {current === "welcome" && (
                <div className="text-center animate-fade-in">
                  <LogoIcon className="w-12 h-12 text-o2-green mx-auto mb-4 animate-logo-breathe" />
                  <h1 className="text-xl font-bold text-ink mb-1.5">Bem-vindo(a) ao {squadName}</h1>
                  <p className="text-sm text-ink-mid">
                    {isAdmin
                      ? "Alguns passos rápidos pra deixar tudo pronto — pode pular qualquer um deles."
                      : "Só o básico pra você começar a usar a plataforma."}
                  </p>
                </div>
              )}

              {current === "google" && (
                <div className="animate-fade-in">
                  <Globe size={28} className="text-o2-green mb-4" />
                  <h1 className="text-lg font-bold text-ink mb-1.5">Conecte sua conta Google</h1>
                  <p className="text-sm text-ink-mid mb-6">
                    Sincroniza Gmail (Meet Recaps + tarefas por e-mail) e Google Calendar. Dá pra fazer isso depois também, em Configurações.
                  </p>
                  {checkingGoogle ? (
                    <div className="h-11 bg-surface-2 rounded-xl animate-pulse" />
                  ) : googleConnected ? (
                    <div className="flex items-center gap-2 text-sm text-o2-green bg-o2-green/10 px-4 py-3 rounded-xl">
                      <CheckCircle2 size={16} />
                      Conta Google conectada
                    </div>
                  ) : (
                    <button
                      onClick={connectGoogle}
                      className="w-full flex items-center justify-center gap-2.5 bg-o2-green text-bg font-bold py-3 px-4 rounded-xl hover:bg-o2-green-bright transition-all text-sm"
                    >
                      <Globe size={16} />
                      Conectar conta Google
                    </button>
                  )}
                </div>
              )}

              {current === "slack" && (
                <div className="animate-fade-in">
                  <Users size={28} className="text-o2-green mb-4" />
                  <h1 className="text-lg font-bold text-ink mb-1.5">Notificações no Slack</h1>
                  <p className="text-sm text-ink-mid mb-4">
                    Opcional — cole o Bot Token do Slack do squad pra receber avisos de tarefa por lá. Dá pra configurar (e mapear cada pessoa) depois em Configurações → Slack.
                  </p>
                  <input
                    type="password"
                    placeholder="xoxb-00000000000-... (opcional)"
                    value={slackToken}
                    onChange={(e) => setSlackToken(e.target.value)}
                    className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2.5 text-sm text-ink placeholder:text-ink-ghost focus:outline-none focus:border-o2-green/50"
                  />
                  {slackSaved && <p className="text-xs text-o2-green mt-2">Token salvo!</p>}
                </div>
              )}

              {current === "meetrecap" && (
                <div className="animate-fade-in">
                  <Sparkles size={28} className="text-o2-green mb-4" />
                  <h1 className="text-lg font-bold text-ink mb-1.5">Sugestões da IA já estão ligadas</h1>
                  <p className="text-sm text-ink-mid">
                    A IA já vai sugerir tarefas a partir dos Meet Recaps do Gmail conectado, revisáveis em Sugestões da IA. Escolher qual conta sincroniza, minuta de cobrança e o secret do n8n ficam em Configurações → Squad, quando quiser.
                  </p>
                </div>
              )}

              {current === "done" && (
                <div className="text-center animate-fade-in">
                  <div className="w-12 h-12 rounded-full bg-o2-green/10 flex items-center justify-center mx-auto mb-4">
                    <CheckCircle2 size={24} className="text-o2-green" />
                  </div>
                  <h1 className="text-xl font-bold text-ink mb-1.5">Tudo pronto</h1>
                  <p className="text-sm text-ink-mid">
                    {isAdmin
                      ? "Já dá pra convidar o resto do time em Equipe."
                      : "Já dá pra começar a usar a plataforma."}
                  </p>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between mt-6 pt-2">
              <button onClick={finish} className="text-xs text-ink-faint hover:text-ink-mid transition-colors">
                Pular tudo
              </button>
              {current === "done" ? (
                <button
                  onClick={async () => { await finish(); if (isAdmin) router.push("/equipe"); }}
                  className="text-xs font-bold text-bg bg-o2-green px-4 py-2 rounded-lg hover:bg-o2-green-bright transition-all"
                >
                  {isAdmin ? "Convidar time" : "Começar a usar"}
                </button>
              ) : current === "slack" ? (
                <button
                  onClick={saveSlackToken}
                  disabled={slackSaving}
                  className="text-xs font-medium text-o2-green hover:underline disabled:opacity-50"
                >
                  {slackSaving ? "Salvando..." : slackToken.trim() ? "Salvar e continuar →" : "Pular →"}
                </button>
              ) : (
                <button onClick={() => goTo(step + 1)} className="text-xs font-medium text-o2-green hover:underline">
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
