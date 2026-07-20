"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";

export default function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(
    searchParams.get("error") ? "Esse e-mail ainda não tem acesso liberado no squad." : ""
  );
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const res = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });

    if (res?.error) {
      setError("Email ou senha incorretos.");
      setLoading(false);
    } else {
      router.push("/dashboard");
    }
  }

  async function handleGoogle() {
    setGoogleLoading(true);
    await signIn("google", { callbackUrl: "/dashboard" });
  }

  return (
    <>
      <h1 className="text-xl font-bold text-ink mb-1">Entrar</h1>
      <p className="text-sm text-ink-mid mb-8">Acesso restrito ao squad O2.</p>

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

        <div>
          <div className="flex items-center justify-between">
            <label className="text-xs font-medium text-ink-mid uppercase tracking-wide">Senha</label>
            <a href="/forgot-password" className="text-xs text-o2-green hover:underline">
              Esqueci minha senha
            </a>
          </div>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
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
          {loading ? "Entrando..." : "Entrar"}
        </button>
      </form>

      <div className="flex items-center gap-3 my-5">
        <div className="flex-1 h-px bg-border" />
        <span className="text-xs text-ink-faint">ou</span>
        <div className="flex-1 h-px bg-border" />
      </div>

      <button
        type="button"
        onClick={handleGoogle}
        disabled={googleLoading}
        className="w-full flex items-center justify-center gap-2.5 bg-surface-2 border border-border text-ink font-medium py-3 px-4 rounded-xl hover:border-o2-green/50 transition-all text-sm disabled:opacity-50"
      >
        <svg width="16" height="16" viewBox="0 0 24 24">
          <path fill="#4285F4" d="M23.52 12.27c0-.85-.08-1.67-.22-2.45H12v4.64h6.48c-.28 1.5-1.13 2.78-2.4 3.63v3.02h3.87c2.27-2.09 3.57-5.17 3.57-8.84z" />
          <path fill="#34A853" d="M12 24c3.24 0 5.96-1.07 7.95-2.9l-3.87-3.02c-1.08.72-2.46 1.15-4.08 1.15-3.13 0-5.78-2.11-6.73-4.96H1.27v3.11C3.25 21.3 7.31 24 12 24z" />
          <path fill="#FBBC05" d="M5.27 14.27a7.24 7.24 0 0 1 0-4.54V6.62H1.27a11.98 11.98 0 0 0 0 10.76l4-3.11z" />
          <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.25 2.7 1.27 6.62l4 3.11C6.22 6.86 8.87 4.75 12 4.75z" />
        </svg>
        {googleLoading ? "Redirecionando..." : "Continuar com Google"}
      </button>
    </>
  );
}
