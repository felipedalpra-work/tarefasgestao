"use client";

import { useEffect, useRef, useState } from "react";
import { Eye, EyeOff, Copy, KeyRound, RefreshCw, X, Check } from "lucide-react";
import { toast } from "./Toaster";

export type ClientLoginData = {
  id: string;
  empresa: string;
  erp: string | null;
  accessMode: string | null;
  login: string | null;
  hasPassword: boolean;
  hasOtp: boolean;
};

// Uma linha de acesso ao ERP/Oxy de um cliente. Extraído da tela de cliente (ClientTabs)
// porque senha revelada sob pedido + código OTP com contagem regressiva ao vivo já é
// estado de sobra pra não inchar mais um componente de 500+ linhas.
//
// Senha e segredo OTP NUNCA chegam aqui já preenchidos — `hasPassword`/`hasOtp` só dizem
// "existe" ou não; o valor de verdade só chega quando a pessoa clica em revelar (ver
// src/app/api/clients/[name]/logins/[id]/{reveal,otp}/route.ts).
export function ClientLoginRow({
  client,
  login,
  knownEmpresas = [],
  onChange,
  onRemove,
}: {
  client: string;
  login: ClientLoginData;
  knownEmpresas?: string[];
  onChange: (id: string, patch: Partial<ClientLoginData>) => void;
  onRemove: (id: string) => void;
}) {
  const base = `/api/clients/${encodeURIComponent(client)}/logins/${login.id}`;

  async function patch(field: string, value: string) {
    onChange(login.id, { [field]: value || null } as Partial<ClientLoginData>);
    const res = await fetch(base, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [field]: value || null }),
    });
    if (!res.ok) toast("Erro ao salvar acesso", "error");
  }

  return (
    <div className="bg-surface-2 border border-surface-3 rounded-xl p-3 space-y-2.5">
      <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_1fr_auto] gap-2 items-center">
        <EmpresaField value={login.empresa} knownEmpresas={knownEmpresas} onCommit={(v) => patch("empresa", v)} />
        <input
          type="text"
          defaultValue={login.erp ?? ""}
          placeholder="ERP"
          onBlur={(e) => e.target.value !== (login.erp ?? "") && patch("erp", e.target.value)}
          className="w-full bg-surface border border-surface-3 rounded-lg px-3 py-2 text-sm text-ink placeholder:text-ink-ghost focus:outline-none focus:border-o2-green/50"
        />
        <input
          type="text"
          defaultValue={login.accessMode ?? ""}
          placeholder="Modo de acesso (login/senha, API…)"
          onBlur={(e) => e.target.value !== (login.accessMode ?? "") && patch("accessMode", e.target.value)}
          className="w-full bg-surface border border-surface-3 rounded-lg px-3 py-2 text-sm text-ink placeholder:text-ink-ghost focus:outline-none focus:border-o2-green/50"
        />
        <button
          onClick={() => onRemove(login.id)}
          className="p-2 text-ink-faint hover:text-red-400 transition-colors justify-self-end sm:justify-self-auto"
          title="Remover acesso"
        >
          <X size={14} />
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <input
          type="text"
          defaultValue={login.login ?? ""}
          placeholder="Login / usuário"
          autoComplete="off"
          onBlur={(e) => e.target.value !== (login.login ?? "") && patch("login", e.target.value)}
          className="w-full bg-surface border border-surface-3 rounded-lg px-3 py-2 text-sm text-ink placeholder:text-ink-ghost focus:outline-none focus:border-o2-green/50"
        />
        <PasswordField base={base} login={login} onChange={onChange} />
      </div>

      <OtpField base={base} login={login} onChange={onChange} />
    </div>
  );
}

const NOVA_EMPRESA = "__nova__";

// "Empresa" (razão social) vira SELEÇÃO das empresas já cadastradas noutro acesso desse
// mesmo cliente, em vez de digitar de novo toda vez — evita "Allebras LTDA" e "Allebras
// Ltda" virarem duas empresas diferentes só por causa de digitação, e é mais rápido pra
// cliente com várias CNPJs. Sem nenhuma empresa conhecida ainda (primeiro acesso do
// cliente), não tem o que selecionar — fica texto livre como sempre foi.
function EmpresaField({
  value,
  knownEmpresas,
  onCommit,
}: {
  value: string;
  knownEmpresas: string[];
  onCommit: (value: string) => void;
}) {
  const [typingNew, setTypingNew] = useState(false);

  if (knownEmpresas.length === 0 || typingNew) {
    return (
      <input
        type="text"
        defaultValue={value}
        placeholder="Empresa"
        autoFocus={typingNew}
        onBlur={(e) => {
          if (!e.target.value.trim() && knownEmpresas.length > 0) { setTypingNew(false); return; } // voltou vazio, volta pro select
          if (e.target.value !== value) onCommit(e.target.value);
        }}
        className="w-full bg-surface border border-surface-3 rounded-lg px-3 py-2 text-sm text-ink placeholder:text-ink-ghost focus:outline-none focus:border-o2-green/50"
      />
    );
  }

  const options = value && !knownEmpresas.includes(value) ? [value, ...knownEmpresas] : knownEmpresas;

  return (
    <select
      value={value || ""}
      onChange={(e) => (e.target.value === NOVA_EMPRESA ? setTypingNew(true) : onCommit(e.target.value))}
      className="w-full bg-surface border border-surface-3 rounded-lg px-3 py-2 text-sm text-ink focus:outline-none focus:border-o2-green/50"
    >
      {!value && <option value="">Selecione a empresa</option>}
      {options.map((empresa) => (
        <option key={empresa} value={empresa}>{empresa}</option>
      ))}
      <option value={NOVA_EMPRESA}>+ Nova empresa…</option>
    </select>
  );
}

function PasswordField({
  base,
  login,
  onChange,
}: {
  base: string;
  login: ClientLoginData;
  onChange: (id: string, patch: Partial<ClientLoginData>) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [revealed, setRevealed] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function reveal() {
    if (revealed) { setRevealed(null); return; } // já revelado — clicar de novo só oculta, sem pedir de novo
    setBusy(true);
    const res = await fetch(`${base}/reveal`, { method: "POST" });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) { toast(data.error || "Erro ao revelar a senha", "error"); return; }
    setRevealed(data.password);
  }

  async function save() {
    if (!draft.trim()) return;
    setBusy(true);
    const res = await fetch(base, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: draft }),
    });
    setBusy(false);
    if (res.ok) {
      onChange(login.id, { hasPassword: true });
      setEditing(false);
      setDraft("");
      setRevealed(null);
      toast("Senha salva", "success");
    } else {
      toast("Erro ao salvar a senha", "error");
    }
  }

  async function remove() {
    setBusy(true);
    const res = await fetch(base, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: "" }),
    });
    setBusy(false);
    if (res.ok) {
      onChange(login.id, { hasPassword: false });
      setRevealed(null);
      toast("Senha removida", "success");
    } else {
      toast("Erro ao remover a senha", "error");
    }
  }

  function copy(value: string) {
    navigator.clipboard.writeText(value).then(() => toast("Copiado", "success")).catch(() => toast("Não consegui copiar", "error"));
  }

  if (editing) {
    return (
      <div className="flex items-center gap-1.5">
        <input
          type="password"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Nova senha"
          autoComplete="new-password"
          className="w-full bg-surface border border-surface-3 rounded-lg px-3 py-2 text-sm text-ink placeholder:text-ink-ghost focus:outline-none focus:border-o2-green/50"
        />
        <button onClick={save} disabled={busy || !draft.trim()} className="p-2 text-o2-green hover:text-o2-green-bright disabled:opacity-50 shrink-0" title="Salvar senha">
          <Check size={16} />
        </button>
        <button onClick={() => { setEditing(false); setDraft(""); }} className="p-2 text-ink-faint hover:text-ink shrink-0" title="Cancelar">
          <X size={16} />
        </button>
      </div>
    );
  }

  if (!login.hasPassword) {
    return (
      <button
        onClick={() => setEditing(true)}
        className="w-full flex items-center justify-center gap-1.5 text-xs text-ink-faint hover:text-ink border border-dashed border-surface-3 rounded-lg px-3 py-2 transition-colors"
      >
        <KeyRound size={13} />
        Cadastrar senha
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1.5 bg-surface border border-surface-3 rounded-lg px-3 py-2">
      <span className="flex-1 text-sm text-ink font-mono truncate">{revealed ?? "••••••••••"}</span>
      <button onClick={reveal} disabled={busy} className="p-0.5 text-ink-faint hover:text-ink disabled:opacity-50 shrink-0" title={revealed ? "Ocultar" : "Revelar senha"}>
        {revealed ? <EyeOff size={14} /> : <Eye size={14} />}
      </button>
      {revealed && (
        <button onClick={() => copy(revealed)} className="p-0.5 text-ink-faint hover:text-ink shrink-0" title="Copiar">
          <Copy size={14} />
        </button>
      )}
      <button onClick={() => setEditing(true)} className="p-0.5 text-ink-faint hover:text-ink shrink-0" title="Trocar senha">
        <RefreshCw size={13} />
      </button>
      <button onClick={remove} className="p-0.5 text-ink-faint hover:text-red-400 shrink-0" title="Remover senha">
        <X size={14} />
      </button>
    </div>
  );
}

function OtpField({
  base,
  login,
  onChange,
}: {
  base: string;
  login: ClientLoginData;
  onChange: (id: string, patch: Partial<ClientLoginData>) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [otp, setOtp] = useState<{ code: string; secondsRemaining: number } | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // busca o código atual e agenda a próxima busca pra exatamente quando a janela de
  // 30s virar — evita tanto ficar com código velho na tela quanto reconsultar toda
  // hora à toa enquanto o mesmo código ainda vale
  async function fetchCode() {
    const res = await fetch(`${base}/otp`);
    const data = await res.json();
    if (!res.ok) { toast(data.error || "Erro ao gerar o código", "error"); setOtp(null); return; }
    setOtp(data);
  }

  useEffect(() => {
    if (!otp) return;
    if (tickRef.current) clearInterval(tickRef.current);
    tickRef.current = setInterval(() => {
      setOtp((prev) => {
        if (!prev) return prev;
        if (prev.secondsRemaining <= 1) { fetchCode(); return prev; }
        return { ...prev, secondsRemaining: prev.secondsRemaining - 1 };
      });
    }, 1000);
    return () => { if (tickRef.current) clearInterval(tickRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [otp?.code]);

  useEffect(() => () => { if (tickRef.current) clearInterval(tickRef.current); }, []);

  function copy() {
    if (!otp) return;
    navigator.clipboard.writeText(otp.code).then(() => toast("Código copiado", "success")).catch(() => toast("Não consegui copiar", "error"));
  }

  async function save() {
    if (!draft.trim()) return;
    setBusy(true);
    const res = await fetch(base, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ otpSecret: draft.trim() }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (res.ok) {
      onChange(login.id, { hasOtp: true });
      setEditing(false);
      setDraft("");
      toast("Autenticação em duas etapas configurada", "success");
    } else {
      toast(data.error || "Erro ao salvar o segredo OTP", "error");
    }
  }

  async function remove() {
    setBusy(true);
    const res = await fetch(base, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ otpSecret: "" }),
    });
    setBusy(false);
    if (res.ok) {
      onChange(login.id, { hasOtp: false });
      setOtp(null);
      toast("OTP removido", "success");
    } else {
      toast("Erro ao remover o OTP", "error");
    }
  }

  if (editing) {
    return (
      <div className="flex items-center gap-1.5">
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Segredo OTP (Base32) — o ERP mostra isso ao ativar o 2FA"
          autoComplete="off"
          className="w-full bg-surface border border-surface-3 rounded-lg px-3 py-2 text-sm text-ink placeholder:text-ink-ghost focus:outline-none focus:border-o2-green/50 font-mono"
        />
        <button onClick={save} disabled={busy || !draft.trim()} className="p-2 text-o2-green hover:text-o2-green-bright disabled:opacity-50 shrink-0" title="Salvar">
          <Check size={16} />
        </button>
        <button onClick={() => { setEditing(false); setDraft(""); }} className="p-2 text-ink-faint hover:text-ink shrink-0" title="Cancelar">
          <X size={16} />
        </button>
      </div>
    );
  }

  if (!login.hasOtp) {
    return (
      <button
        onClick={() => setEditing(true)}
        className="w-full flex items-center justify-center gap-1.5 text-xs text-ink-faint hover:text-ink border border-dashed border-surface-3 rounded-lg px-3 py-2 transition-colors"
      >
        <KeyRound size={13} />
        Configurar autenticação em duas etapas (OTP)
      </button>
    );
  }

  return (
    <div className="bg-surface border border-surface-3 rounded-lg px-3 py-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-ink-dim">Autenticação em duas etapas (OTP)</span>
        <div className="flex items-center gap-1">
          <button onClick={() => setEditing(true)} className="p-0.5 text-ink-faint hover:text-ink" title="Trocar segredo">
            <RefreshCw size={12} />
          </button>
          <button onClick={remove} className="p-0.5 text-ink-faint hover:text-red-400" title="Remover OTP">
            <X size={13} />
          </button>
        </div>
      </div>
      {otp ? (
        <div className="flex items-center justify-between mt-1.5">
          <div>
            <p className="text-lg font-mono font-bold text-ink tracking-widest">{otp.code}</p>
            <p className="text-[10px] text-ink-faint">Expira em 00:{String(otp.secondsRemaining).padStart(2, "0")}</p>
          </div>
          <button onClick={copy} className="p-1.5 text-ink-faint hover:text-ink" title="Copiar código">
            <Copy size={16} />
          </button>
        </div>
      ) : (
        <button onClick={fetchCode} className="mt-1.5 text-xs text-o2-green hover:text-o2-green-bright">
          Ver código
        </button>
      )}
    </div>
  );
}

