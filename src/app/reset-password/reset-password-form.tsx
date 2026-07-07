"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export default function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (password.length < 8) {
      setError("A senha precisa ter pelo menos 8 caracteres.");
      return;
    }
    if (password !== confirmPassword) {
      setError("As senhas não coincidem.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Não foi possível redefinir a senha.");
        setLoading(false);
        return;
      }
      setDone(true);
      setTimeout(() => router.push("/login"), 2000);
    } catch {
      setError("Não foi possível redefinir a senha.");
      setLoading(false);
    }
  }

  if (!token) {
    return (
      <>
        <h1 className="text-xl font-bold text-ink mb-1">Link inválido</h1>
        <p className="text-sm text-ink-mid mb-6">
          Este link de redefinição de senha está incompleto. Solicite um novo.
        </p>
        <a
          href="/forgot-password"
          className="block text-center w-full bg-surface-2 border border-border text-ink font-medium py-3 px-4 rounded-xl hover:border-o2-green transition-colors text-sm"
        >
          Solicitar novo link
        </a>
      </>
    );
  }

  if (done) {
    return (
      <>
        <h1 className="text-xl font-bold text-ink mb-1">Senha redefinida</h1>
        <p className="text-sm text-ink-mid mb-6">Redirecionando para o login...</p>
      </>
    );
  }

  return (
    <>
      <h1 className="text-xl font-bold text-ink mb-1">Criar nova senha</h1>
      <p className="text-sm text-ink-mid mb-8">Escolha uma nova senha para sua conta.</p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="text-xs font-medium text-ink-mid uppercase tracking-wide">Nova senha</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            required
            className="mt-1.5 w-full bg-surface-2 border border-border rounded-lg px-3 py-2.5 text-sm text-ink placeholder-ink-faint focus:outline-none focus:border-o2-green transition-colors"
          />
        </div>

        <div>
          <label className="text-xs font-medium text-ink-mid uppercase tracking-wide">Confirmar senha</label>
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="••••••••"
            required
            className="mt-1.5 w-full bg-surface-2 border border-border rounded-lg px-3 py-2.5 text-sm text-ink placeholder-ink-faint focus:outline-none focus:border-o2-green transition-colors"
          />
        </div>

        {error && <p className="text-xs text-red-400 bg-red-400/10 px-3 py-2 rounded-lg">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-o2-green text-bg font-bold py-3 px-4 rounded-xl hover:bg-o2-green-bright transition-all text-sm disabled:opacity-50 mt-2"
        >
          {loading ? "Salvando..." : "Redefinir senha"}
        </button>
      </form>
    </>
  );
}
