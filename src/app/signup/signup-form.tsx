"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";

export default function SignupForm() {
  const router = useRouter();
  const [squadName, setSquadName] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const res = await fetch("/api/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ squadName, name, email, password }),
    });
    const data = await res.json();

    if (!res.ok) {
      setError(data.error || "Não foi possível criar a conta.");
      setLoading(false);
      return;
    }

    // já cria logado — mesmo formulário que acabou de mandar o email/senha
    const signInRes = await signIn("credentials", { email, password, redirect: false });
    setLoading(false);
    if (signInRes?.error) {
      router.push("/login");
      return;
    }
    router.push("/dashboard");
  }

  return (
    <>
      <h1 className="text-xl font-bold text-ink mb-1">Criar conta do squad</h1>
      <p className="text-sm text-ink-mid mb-8">Você vira o administrador — dá pra convidar o resto do time depois.</p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="text-xs font-medium text-ink-mid uppercase tracking-wide">Nome do squad</label>
          <input
            type="text"
            value={squadName}
            onChange={(e) => setSquadName(e.target.value)}
            placeholder="ex.: CFO Partners"
            required
            className="mt-1.5 w-full bg-surface-2 border border-border rounded-lg px-3 py-2.5 text-sm text-ink placeholder-ink-faint focus:outline-none focus:border-o2-green transition-colors"
          />
        </div>

        <div>
          <label className="text-xs font-medium text-ink-mid uppercase tracking-wide">Seu nome</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Como te chamam"
            required
            className="mt-1.5 w-full bg-surface-2 border border-border rounded-lg px-3 py-2.5 text-sm text-ink placeholder-ink-faint focus:outline-none focus:border-o2-green transition-colors"
          />
        </div>

        <div>
          <label className="text-xs font-medium text-ink-mid uppercase tracking-wide">Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="voce@suaempresa.com"
            required
            className="mt-1.5 w-full bg-surface-2 border border-border rounded-lg px-3 py-2.5 text-sm text-ink placeholder-ink-faint focus:outline-none focus:border-o2-green transition-colors"
          />
        </div>

        <div>
          <label className="text-xs font-medium text-ink-mid uppercase tracking-wide">Senha</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Mínimo 8 caracteres"
            required
            minLength={8}
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
          {loading ? "Criando…" : "Criar squad"}
        </button>
      </form>

      <p className="text-xs text-ink-faint text-center mt-6">
        Já tem conta? <a href="/login" className="text-o2-green hover:underline">Entrar</a>
      </p>
    </>
  );
}
