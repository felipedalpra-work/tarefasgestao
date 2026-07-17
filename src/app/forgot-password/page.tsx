"use client";

import { useState } from "react";
import { LogoIcon } from "@/components/LogoIcon";
import { LoginFX, TiltCard } from "@/components/LoginFX";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Não foi possível processar o pedido.");
      } else {
        setSent(true);
      }
    } catch {
      setError("Não foi possível processar o pedido.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg px-4">
      <LoginFX />

      <div className="relative w-full max-w-sm">
        <div className="text-center mb-10 animate-login-enter">
          <div className="inline-flex items-center gap-2.5 mb-3">
            <LogoIcon className="w-10 h-10 text-o2-green shrink-0 animate-logo-breathe" />
            <span className="text-5xl font-black text-o2-green tracking-tighter">O2</span>
            <span className="text-lg text-ink-mid uppercase tracking-widest font-medium">Squad</span>
          </div>
          <p className="text-ink-faint text-sm">gestão fluída.</p>
        </div>

        <TiltCard className="animate-login-enter [animation-delay:0.12s]">
        <div className="bg-surface border border-surface-3 rounded-2xl p-8 shadow-2xl">
          {sent ? (
            <>
              <h1 className="text-xl font-bold text-ink mb-1">Verifique seu email</h1>
              <p className="text-sm text-ink-mid mb-6">
                Se <strong className="text-ink-soft">{email}</strong> estiver cadastrado, você vai receber um link para
                redefinir sua senha em instantes.
              </p>
              <a
                href="/login"
                className="block text-center w-full bg-surface-2 border border-border text-ink font-medium py-3 px-4 rounded-xl hover:border-o2-green transition-colors text-sm"
              >
                Voltar ao login
              </a>
            </>
          ) : (
            <>
              <h1 className="text-xl font-bold text-ink mb-1">Esqueci minha senha</h1>
              <p className="text-sm text-ink-mid mb-8">
                Informe seu email e enviaremos um link para redefinir sua senha.
              </p>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="text-xs font-medium text-ink-mid uppercase tracking-wide">Email</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="seu@o2inc.com.br"
                    required
                    className="mt-1.5 w-full bg-surface-2 border border-border rounded-lg px-3 py-2.5 text-sm text-ink placeholder-ink-faint focus:outline-none focus:border-o2-green transition-colors"
                  />
                </div>

                {error && (
                  <p className="text-xs text-red-400 bg-red-400/10 px-3 py-2 rounded-lg">{error}</p>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-o2-green text-bg font-bold py-3 px-4 rounded-xl hover:bg-o2-green-bright transition-all text-sm disabled:opacity-50 mt-2"
                >
                  {loading ? "Enviando..." : "Enviar link de redefinição"}
                </button>

                <a href="/login" className="block text-center text-xs text-ink-mid hover:text-ink-soft transition-colors pt-2">
                  Voltar ao login
                </a>
              </form>
            </>
          )}
        </div>
        </TiltCard>
      </div>
    </div>
  );
}
