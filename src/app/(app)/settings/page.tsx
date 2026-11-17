"use client";

import { useSession, signIn } from "next-auth/react";
import { useEffect, useState } from "react";
import { CheckCircle2, Globe, Calendar, Mail, AlertCircle, Save, Sparkles, Copy, RefreshCw, EyeOff, X, Download, ShieldCheck, KeyRound, Trash2, Thermometer } from "lucide-react";
import { toast } from "@/components/Toaster";
import { cn } from "@/lib/utils";
import { AutoGrowTextarea } from "@/components/AutoGrowTextarea";

type SquadUser = { id: string; name: string | null; email: string; cargo?: string | null; role?: string };

type Tab = "perfil" | "squad";

// Espelha EMAIL_TYPES/DEFAULT_EMAIL_PREFS de src/lib/settings.ts — duplicado aqui (não
// importado) porque aquele arquivo puxa o Prisma, que não pode ir pro bundle do client.
const DEFAULT_EMAIL_PREFS: Record<string, boolean> = {
  taskAssigned: true,
  taskDeadline: true,
  jobFailureAlert: true,
};

const EMAIL_PREF_ITEMS: { key: string; label: string; desc: string; ownerOnly?: boolean }[] = [
  { key: "taskAssigned", label: "Tarefa atribuída", desc: "Quando uma tarefa nova é atribuída a você" },
  { key: "taskDeadline", label: "Alerta de prazo", desc: "Quando uma tarefa sua está vencendo ou já venceu" },
  { key: "jobFailureAlert", label: "Erro de job", desc: "Quando uma rotina automática falha (só chega pra owner da plataforma)", ownerOnly: true },
];

export default function SettingsPage() {
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === "admin";
  const [tab, setTab] = useState<Tab>("perfil");
  const [googleConnected, setGoogleConnected] = useState(false);
  const [loading, setLoading] = useState(true);

  // Gemini pessoal (self-service) state
  const [geminiConnected, setGeminiConnected] = useState(false);
  const [geminiKeyInput, setGeminiKeyInput] = useState("");
  const [geminiSaving, setGeminiSaving] = useState(false);
  const [geminiError, setGeminiError] = useState<string | null>(null);
  const [aiProvider, setAiProvider] = useState<"gemini" | "groq">("gemini");
  const [aiProviderSaving, setAiProviderSaving] = useState(false);

  const [users, setUsers] = useState<SquadUser[]>([]);

  // Meet Recap suggestions state
  const [meetRecapEnabled, setMeetRecapEnabled] = useState(true);
  const [meetRecapSaving, setMeetRecapSaving] = useState(false);
  const [meetRecapGmailUserId, setMeetRecapGmailUserId] = useState<string | null>(null);
  const [meetRecapGmailSaving, setMeetRecapGmailSaving] = useState(false);

  // n8n webhook secret state
  const [n8nSecret, setN8nSecret] = useState<string | null>(null);
  const [n8nRegenerating, setN8nRegenerating] = useState(false);
  const [n8nConfirmRegen, setN8nConfirmRegen] = useState(false);

  // Critério de Temperatura (IA) state
  const [temperaturePrompt, setTemperaturePrompt] = useState("");
  const [temperaturePromptSaving, setTemperaturePromptSaving] = useState(false);

  // Modelo de e-mail pro cliente (Revisão Semanal) state
  const [clientEmailTemplate, setClientEmailTemplate] = useState("");
  const [clientEmailTemplateSaving, setClientEmailTemplateSaving] = useState(false);

  // Minuta de cobrança (rascunho no Gmail) state
  const [billingDraftOwnerId, setBillingDraftOwnerId] = useState<string | null>(null);
  const [billingDraftSaving, setBillingDraftSaving] = useState(false);

  // Remetente dos e-mails de sistema (tarefa nova, prazo, backup, erro de job) state
  const [emailSenderId, setEmailSenderId] = useState<string | null>(null);
  const [emailSenderSaving, setEmailSenderSaving] = useState(false);

  // Preferência pessoal por gatilho de e-mail (própria conta, não do squad) state
  const [emailPrefs, setEmailPrefs] = useState<Record<string, boolean>>(DEFAULT_EMAIL_PREFS);
  const [emailPrefSavingKey, setEmailPrefSavingKey] = useState<string | null>(null);

  // Clientes ignorados (empresa que aparece na agenda mas não é da carteira) state
  const [ignoredClients, setIgnoredClients] = useState<string[]>([]);
  const [unignoring, setUnignoring] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    fetch("/api/settings/google-status")
      .then((r) => r.json())
      .then((d) => { setGoogleConnected(d.connected); setLoading(false); });

    fetch("/api/settings/gemini-key")
      .then((r) => r.json())
      .then((d) => { setGeminiConnected(d.connected); setAiProvider(d.provider === "groq" ? "groq" : "gemini"); });

    fetch("/api/settings/meet-recap")
      .then((r) => r.json())
      .then((d) => { setMeetRecapEnabled(d.enabled); setMeetRecapGmailUserId(d.gmailUserId ?? null); });

    fetch("/api/settings/billing-draft")
      .then((r) => r.json())
      .then((d) => setBillingDraftOwnerId(d.ownerUserId ?? null));

    fetch("/api/settings/email-sender")
      .then((r) => r.json())
      .then((d) => setEmailSenderId(d.senderUserId ?? null));

    fetch("/api/settings/email-prefs")
      .then((r) => r.json())
      .then((d) => setEmailPrefs((prev) => ({ ...prev, ...d })));

    fetch("/api/settings/ignored-clients")
      .then((r) => r.json())
      .then((d) => setIgnoredClients(d.clients ?? []));

    fetch("/api/settings/pipefy-temperature")
      .then((r) => r.json())
      .then((d) => setTemperaturePrompt(d.prompt ?? ""));

    fetch("/api/settings/client-email-template")
      .then((r) => r.json())
      .then((d) => setClientEmailTemplate(d.template ?? ""));

    fetch("/api/users")
      .then((r) => r.json())
      .then((usersData) => setUsers(Array.isArray(usersData) ? usersData : usersData.users ?? []));
  }, []);

  useEffect(() => {
    if (!isAdmin) return;
    fetch("/api/settings/n8n")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setN8nSecret(d.secret));
  }, [isAdmin]);

  async function connectGoogle() {
    await signIn("google", { callbackUrl: "/settings" });
  }

  async function saveGeminiKey() {
    if (!geminiKeyInput.trim()) return;
    setGeminiSaving(true);
    setGeminiError(null);
    const res = await fetch("/api/settings/gemini-key", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ apiKey: geminiKeyInput.trim() }),
    });
    setGeminiSaving(false);
    const d = await res.json().catch(() => ({}));
    if (res.ok) {
      setGeminiConnected(true);
      setGeminiKeyInput("");
      toast("Gemini conectado", "success");
    } else {
      setGeminiError(d.error || "Erro ao conectar");
    }
  }

  async function disconnectGemini() {
    setGeminiSaving(true);
    const res = await fetch("/api/settings/gemini-key", { method: "DELETE" });
    setGeminiSaving(false);
    if (res.ok) {
      setGeminiConnected(false);
      toast("Gemini desconectado", "success");
    } else {
      toast("Erro ao desconectar", "error");
    }
  }

  async function changeAiProvider(provider: "gemini" | "groq") {
    if (provider === aiProvider) return;
    setAiProviderSaving(true);
    const prev = aiProvider;
    setAiProvider(provider);
    const res = await fetch("/api/settings/gemini-key", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider }),
    });
    setAiProviderSaving(false);
    if (res.ok) {
      toast(provider === "gemini" ? "Usando Gemini" : "Usando Groq", "success");
    } else {
      setAiProvider(prev);
      toast("Erro ao trocar", "error");
    }
  }

  async function regenerateN8nSecret() {
    setN8nRegenerating(true);
    setN8nConfirmRegen(false);
    const res = await fetch("/api/settings/n8n", { method: "POST" });
    setN8nRegenerating(false);
    if (res.ok) {
      const d = await res.json();
      setN8nSecret(d.secret);
      toast("Secret regenerado — atualize o workflow n8n com o novo valor", "success");
    } else {
      toast("Erro ao gerar novo secret", "error");
    }
  }

  function copyN8nSecret() {
    if (!n8nSecret) return;
    navigator.clipboard.writeText(n8nSecret);
    toast("Secret copiado", "success");
  }

  async function saveTemperaturePrompt() {
    setTemperaturePromptSaving(true);
    const res = await fetch("/api/settings/pipefy-temperature", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: temperaturePrompt }),
    });
    setTemperaturePromptSaving(false);
    toast(res.ok ? "Critério salvo" : "Erro ao salvar", res.ok ? "success" : "error");
  }

  async function saveClientEmailTemplate() {
    setClientEmailTemplateSaving(true);
    const res = await fetch("/api/settings/client-email-template", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ template: clientEmailTemplate }),
    });
    setClientEmailTemplateSaving(false);
    toast(res.ok ? "Modelo salvo" : "Erro ao salvar", res.ok ? "success" : "error");
  }

  async function saveBillingDraftOwner(ownerUserId: string | null) {
    setBillingDraftSaving(true);
    const prev = billingDraftOwnerId;
    setBillingDraftOwnerId(ownerUserId);
    const res = await fetch("/api/settings/billing-draft", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ownerUserId }),
    });
    setBillingDraftSaving(false);
    if (res.ok) {
      toast(ownerUserId ? "Dono da minuta de cobrança atualizado" : "Minuta de cobrança desativada", "success");
    } else {
      setBillingDraftOwnerId(prev);
      toast("Erro ao salvar", "error");
    }
  }

  async function saveEmailSender(senderUserId: string | null) {
    setEmailSenderSaving(true);
    const prev = emailSenderId;
    setEmailSenderId(senderUserId);
    const res = await fetch("/api/settings/email-sender", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ senderUserId }),
    });
    setEmailSenderSaving(false);
    if (res.ok) {
      toast(senderUserId ? "Remetente dos e-mails atualizado" : "Voltou ao remetente padrão", "success");
    } else {
      setEmailSenderId(prev);
      toast("Erro ao salvar", "error");
    }
  }

  async function toggleEmailPref(key: string, enabled: boolean) {
    setEmailPrefSavingKey(key);
    const prev = emailPrefs[key];
    setEmailPrefs((p) => ({ ...p, [key]: enabled }));
    const res = await fetch("/api/settings/email-prefs", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: key, enabled }),
    });
    setEmailPrefSavingKey(null);
    if (!res.ok) {
      setEmailPrefs((p) => ({ ...p, [key]: prev }));
      toast("Erro ao salvar", "error");
    }
  }

  async function unignoreClient(name: string) {
    setUnignoring(name);
    const res = await fetch(`/api/settings/ignored-clients?client=${encodeURIComponent(name)}`, { method: "DELETE" });
    setUnignoring(null);
    if (res.ok) {
      const d = await res.json();
      setIgnoredClients(d.clients ?? []);
      toast(`${name} liberado — volta pra carteira no próximo sync da agenda`, "success");
    } else {
      const d = await res.json().catch(() => ({}));
      toast(d.error || "Erro ao liberar cliente", "error");
    }
  }

  // baixa o JSON via blob (em vez de só navegar pra URL) pra conseguir mostrar erro
  // se a exportação falhar, em vez do navegador simplesmente abrir uma tela em branco
  async function exportData() {
    setExporting(true);
    const res = await fetch("/api/export");
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      toast(d.error || "Erro ao gerar a exportação", "error");
      setExporting(false);
      return;
    }
    const blob = await res.blob();
    const disposition = res.headers.get("Content-Disposition") || "";
    const match = disposition.match(/filename="([^"]+)"/);
    const filename = match?.[1] || "export.json";
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    setExporting(false);
    toast("Exportação baixada", "success");
  }

  async function toggleMeetRecap(enabled: boolean) {
    setMeetRecapSaving(true);
    const prev = meetRecapEnabled;
    setMeetRecapEnabled(enabled);
    const res = await fetch("/api/settings/meet-recap", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled }),
    });
    setMeetRecapSaving(false);
    if (res.ok) {
      toast(enabled ? "Sugestões de Meet Recap reativadas" : "Sugestões de Meet Recap desativadas", "success");
    } else {
      setMeetRecapEnabled(prev);
      toast("Erro ao salvar", "error");
    }
  }

  async function saveMeetRecapGmailUser(userId: string | null) {
    setMeetRecapGmailSaving(true);
    const prev = meetRecapGmailUserId;
    setMeetRecapGmailUserId(userId);
    const res = await fetch("/api/settings/meet-recap", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ gmailUserId: userId }),
    });
    setMeetRecapGmailSaving(false);
    if (res.ok) {
      toast(userId ? "Conta de sincronização atualizada" : "Voltou a sincronizar de todas as contas", "success");
    } else {
      setMeetRecapGmailUserId(prev);
      toast("Erro ao salvar", "error");
    }
  }

  return (
    <div className="p-4 md:p-8 max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-ink">Configurações</h1>
        <p className="text-ink-mid text-sm mt-0.5">Gerencie suas integrações</p>
      </div>

      <div className="flex items-center gap-2 mb-6">
        <button
          onClick={() => setTab("perfil")}
          className={cn(
            "text-xs font-medium px-3 py-1.5 rounded-full transition-colors",
            tab === "perfil" ? "bg-o2-green/15 text-o2-green" : "bg-surface-2 text-ink-mid hover:text-ink"
          )}
        >
          Perfil
        </button>
        <button
          onClick={() => setTab("squad")}
          className={cn(
            "text-xs font-medium px-3 py-1.5 rounded-full transition-colors",
            tab === "squad" ? "bg-o2-green/15 text-o2-green" : "bg-surface-2 text-ink-mid hover:text-ink"
          )}
        >
          Squad
        </button>
      </div>

      {tab === "perfil" && (
        <div className="space-y-4">
          {/* Perfil */}
          <div className="bg-surface border border-surface-3 rounded-xl p-6">
            <h2 className="text-sm font-semibold text-ink uppercase tracking-wide mb-4">Perfil</h2>
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-o2-green/20 flex items-center justify-center text-o2-green font-bold text-lg">
                {session?.user?.name?.[0] || "?"}
              </div>
              <div>
                <p className="font-medium text-ink">{session?.user?.name}</p>
                <p className="text-sm text-ink-mid">{session?.user?.email}</p>
              </div>
            </div>
          </div>

          {/* Google Integration */}
          <div className="bg-surface border border-surface-3 rounded-xl p-6">
            <h2 className="text-sm font-semibold text-ink uppercase tracking-wide mb-2">
              Integração Google
            </h2>
            <p className="text-xs text-ink-mid mb-6">
              Conecte sua conta Google para sincronizar Gmail e Calendar com o sistema.
            </p>

            <div className="space-y-3 mb-6">
              {[
                { icon: Mail, label: "Gmail", desc: "Detectar emails que viram tarefas + Meet Recaps" },
                { icon: Calendar, label: "Google Calendar", desc: "Ver reuniões e criar tarefas a partir de eventos" },
              ].map(({ icon: Icon, label, desc }) => (
                <div key={label} className="flex items-center gap-3 bg-surface-2 rounded-lg px-4 py-3">
                  <Icon size={16} className={googleConnected ? "text-o2-green" : "text-ink-faint"} />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-ink">{label}</p>
                    <p className="text-xs text-ink-dim">{desc}</p>
                  </div>
                  {googleConnected ? (
                    <CheckCircle2 size={15} className="text-o2-green" />
                  ) : (
                    <AlertCircle size={15} className="text-ink-faint" />
                  )}
                </div>
              ))}
            </div>

            {loading ? (
              <div className="h-10 bg-surface-2 rounded-xl animate-pulse" />
            ) : googleConnected ? (
              <div className="flex items-center gap-2 text-sm text-o2-green bg-o2-green/10 px-4 py-3 rounded-xl">
                <CheckCircle2 size={15} />
                Conta Google conectada com sucesso
              </div>
            ) : (
              <button
                onClick={connectGoogle}
                className="w-full flex items-center justify-center gap-3 bg-o2-green text-bg font-bold py-3 px-4 rounded-xl hover:bg-o2-green-bright transition-all text-sm"
              >
                <Globe size={16} />
                Conectar conta Google
              </button>
            )}
          </div>

          {/* Preferências de e-mail (pessoal) */}
          <div className="bg-surface border border-surface-3 rounded-xl p-6">
            <h2 className="text-sm font-semibold text-ink uppercase tracking-wide mb-2">E-mails que você recebe</h2>
            <p className="text-xs text-ink-mid mb-4">
              Liga/desliga cada tipo de e-mail só pra você — não afeta o resto do squad. O backup diário e a
              redefinição de senha não têm essa opção: o backup é obrigatório pra todo admin, e a redefinição só
              chega quando você mesmo pede.
            </p>
            <div className="space-y-1.5">
              {EMAIL_PREF_ITEMS.filter((item) => !item.ownerOnly || session?.user?.isOwner).map((item) => (
                <label key={item.key} className="flex items-center gap-3 bg-surface-2 rounded-lg px-4 py-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={emailPrefs[item.key] ?? true}
                    disabled={emailPrefSavingKey === item.key}
                    onChange={(e) => toggleEmailPref(item.key, e.target.checked)}
                    className="accent-o2-green"
                  />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-ink">{item.label}</p>
                    <p className="text-xs text-ink-dim">{item.desc}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Gemini pessoal (self-service) */}
          <div className="bg-surface border border-surface-3 rounded-xl p-6">
            <h2 className="text-sm font-semibold text-ink uppercase tracking-wide mb-2">IA pessoal (Gemini)</h2>
            <p className="text-xs text-ink-mid mb-6">
              Conecte sua própria chave do Google Gemini. Hoje isso só entra em uso na extração de tarefa dos
              Meet Recaps — e só se você for a pessoa designada pra sincronizar Meet Recap do squad (aba Squad
              mais abaixo). Ainda não afeta o Assistente de IA.
            </p>

            {geminiConnected ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm text-o2-green bg-o2-green/10 px-4 py-3 rounded-xl">
                  <CheckCircle2 size={15} />
                  Gemini conectado
                </div>

                <div>
                  <label className="block text-xs text-ink-mid mb-1.5">Provedor ativo</label>
                  <div className="flex items-center bg-surface-2 border border-border rounded-xl p-1 w-fit">
                    <button
                      onClick={() => changeAiProvider("groq")}
                      disabled={aiProviderSaving}
                      className={cn(
                        "px-3 py-1.5 rounded-lg text-xs font-medium transition-all disabled:opacity-50",
                        aiProvider === "groq" ? "bg-o2-green/10 text-o2-green" : "text-ink-mid hover:text-ink"
                      )}
                    >
                      Groq
                    </button>
                    <button
                      onClick={() => changeAiProvider("gemini")}
                      disabled={aiProviderSaving}
                      className={cn(
                        "px-3 py-1.5 rounded-lg text-xs font-medium transition-all disabled:opacity-50",
                        aiProvider === "gemini" ? "bg-o2-green/10 text-o2-green" : "text-ink-mid hover:text-ink"
                      )}
                    >
                      Gemini
                    </button>
                  </div>
                  <p className="text-xs text-ink-faint mt-1.5">
                    {aiProvider === "gemini"
                      ? "Meet Recap usa sua chave do Gemini."
                      : "Meet Recap usa o Groq do squad (sua chave do Gemini fica salva, só não é usada)."}
                  </p>
                </div>

                <button
                  onClick={disconnectGemini}
                  disabled={geminiSaving}
                  className="flex items-center gap-2 text-xs text-ink-faint hover:text-red-400 transition-colors disabled:opacity-50"
                >
                  <Trash2 size={13} />
                  Desconectar
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <KeyRound size={14} className="text-ink-faint shrink-0" />
                  <input
                    type="password"
                    value={geminiKeyInput}
                    onChange={(e) => { setGeminiKeyInput(e.target.value); setGeminiError(null); }}
                    placeholder="Cole sua chave do Google AI Studio"
                    className="flex-1 bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm text-ink focus:outline-none focus:border-o2-green/50"
                  />
                </div>
                {geminiError && <p className="text-xs text-red-400">{geminiError}</p>}
                <button
                  onClick={saveGeminiKey}
                  disabled={geminiSaving || !geminiKeyInput.trim()}
                  className="w-full flex items-center justify-center gap-2 bg-o2-green text-bg font-bold py-2.5 px-4 rounded-xl hover:bg-o2-green-bright transition-all text-sm disabled:opacity-50"
                >
                  {geminiSaving ? <RefreshCw size={14} className="animate-spin" /> : <KeyRound size={14} />}
                  Conectar Gemini
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {tab === "squad" && (
        <div className="space-y-4">
          {/* Meet Recap suggestions */}
          <div className="bg-surface border border-surface-3 rounded-xl p-6">
            <h2 className="text-sm font-semibold text-ink uppercase tracking-wide mb-2">Meet Recaps (IA)</h2>
            <p className="text-xs text-ink-mid mb-6">
              Sugestão automática de tarefa a partir dos Meet Recaps do Gmail. Os recaps continuam sincronizando normalmente — isso só liga/desliga a IA gerar sugestões em <span className="text-ink-soft">/sugestoes-ia</span>. As tarefas do workflow n8n não são afetadas.
            </p>
            <label className={cn("flex items-center gap-3 bg-surface-2 rounded-lg px-4 py-3", isAdmin ? "cursor-pointer" : "cursor-not-allowed opacity-70")}>
              <input
                type="checkbox"
                checked={meetRecapEnabled}
                disabled={meetRecapSaving || !isAdmin}
                onChange={(e) => toggleMeetRecap(e.target.checked)}
                className="accent-o2-green"
              />
              <Sparkles size={16} className={meetRecapEnabled ? "text-o2-green" : "text-ink-faint"} />
              <div className="flex-1">
                <p className="text-sm font-medium text-ink">Gerar sugestões de tarefa dos Meet Recaps</p>
                <p className="text-xs text-ink-dim">{meetRecapEnabled ? "Ativado" : "Desativado — nenhuma sugestão nova até religar"}</p>
              </div>
            </label>

            <div className="mt-4 pt-4 border-t border-surface-3">
              <label className="block text-xs text-ink-mid mb-1.5">Conta Gmail sincronizada</label>
              <p className="text-xs text-ink-faint mb-2">
                Se mais de uma conta sincronizar, o mesmo recap chega duplicado (uma cópia em cada caixa) e pode gerar sugestões divergentes. Recomendado manter só uma conta.
              </p>
              <select
                value={meetRecapGmailUserId ?? ""}
                disabled={meetRecapGmailSaving || !isAdmin}
                onChange={(e) => saveMeetRecapGmailUser(e.target.value || null)}
                className="w-full sm:w-72 bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm text-ink focus:outline-none focus:border-o2-green/50 disabled:opacity-60"
              >
                <option value="">Todas as contas conectadas (não recomendado)</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>{u.name || u.email}</option>
                ))}
              </select>
              {!isAdmin && <p className="text-xs text-ink-faint mt-2">Só admin do squad pode alterar.</p>}
            </div>
          </div>

          {/* Minuta de cobrança */}
          <div className="bg-surface border border-surface-3 rounded-xl p-6">
            <h2 className="text-sm font-semibold text-ink uppercase tracking-wide mb-2">Minuta de cobrança</h2>
            <p className="text-xs text-ink-mid mb-4">
              Tarefa do cliente vencida (sem responsável interno) cria um <span className="text-ink-soft">rascunho</span> — nunca envia — no Gmail de quem estiver aqui, já redigido pra cobrar o cliente. Sem ninguém selecionado, esse recurso fica desligado.
            </p>
            <select
              value={billingDraftOwnerId ?? ""}
              disabled={billingDraftSaving || !isAdmin}
              onChange={(e) => saveBillingDraftOwner(e.target.value || null)}
              className="w-full sm:w-72 bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm text-ink focus:outline-none focus:border-o2-green/50 disabled:opacity-60"
            >
              <option value="">Desligado</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>{u.name || u.email}</option>
              ))}
            </select>
            {!isAdmin && <p className="text-xs text-ink-faint mt-2">Só admin do squad pode alterar.</p>}
          </div>

          {/* Remetente dos e-mails de sistema */}
          <div className="bg-surface border border-surface-3 rounded-xl p-6">
            <h2 className="text-sm font-semibold text-ink uppercase tracking-wide mb-2">Remetente dos e-mails</h2>
            <p className="text-xs text-ink-mid mb-4">
              Conta Google que assina os e-mails de tarefa nova, alerta de prazo, backup diário e erro de job — todos saem
              por ela. Sem ninguém selecionado aqui, usa o dono da minuta de cobrança e, sem isso também, qualquer conta
              conectada na plataforma. Quando existir um e-mail corporativo só da plataforma, basta selecionar essa conta
              aqui assim que ela conectar o Google — não precisa de nada além disso.
            </p>
            <select
              value={emailSenderId ?? ""}
              disabled={emailSenderSaving || !isAdmin}
              onChange={(e) => saveEmailSender(e.target.value || null)}
              className="w-full sm:w-72 bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm text-ink focus:outline-none focus:border-o2-green/50 disabled:opacity-60"
            >
              <option value="">Padrão (dono da minuta de cobrança)</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>{u.name || u.email}</option>
              ))}
            </select>
            {!isAdmin && <p className="text-xs text-ink-faint mt-2">Só admin do squad pode alterar.</p>}
          </div>

          {/* Clientes ignorados */}
          <div className="bg-surface border border-surface-3 rounded-xl p-6">
            <h2 className="text-sm font-semibold text-ink uppercase tracking-wide mb-2">Clientes ignorados</h2>
            <p className="text-xs text-ink-mid mb-4">
              Reunião <span className="text-ink-soft">O2 Inc &amp; Empresa | ...</span> na agenda de alguém do squad
              faz a empresa entrar na carteira sozinha. Excluir um cliente coloca o nome aqui, pra ele não voltar no
              próximo sync da agenda. Liberar traz de volta: as reuniões futuras reaparecem no sync seguinte.
            </p>
            {ignoredClients.length === 0 ? (
              <p className="text-xs text-ink-faint bg-surface-2 rounded-lg px-3 py-2.5">
                Nenhum nome ignorado — toda empresa que aparecer na agenda entra na carteira.
              </p>
            ) : (
              <div className="space-y-1.5">
                {ignoredClients.map((name) => (
                  <div key={name} className="flex items-center gap-3 bg-surface-2 rounded-lg px-3 py-2.5">
                    <EyeOff size={14} className="text-ink-faint shrink-0" />
                    <span className="text-sm text-ink-soft flex-1 min-w-0 truncate">{name}</span>
                    {isAdmin && (
                      <button
                        type="button"
                        onClick={() => unignoreClient(name)}
                        disabled={unignoring === name}
                        title="Liberar — volta pra carteira"
                        className="shrink-0 flex items-center gap-1 text-xs text-ink-faint hover:text-o2-green transition-colors disabled:opacity-50"
                      >
                        <X size={12} />
                        {unignoring === name ? "Liberando..." : "Liberar"}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
            {!isAdmin && ignoredClients.length > 0 && (
              <p className="text-xs text-ink-faint mt-2">Só admin do squad pode liberar.</p>
            )}
          </div>

          {/* Exportar dados — segurança/portabilidade: o squad nunca fica refém da
              plataforma pra ter acesso ao próprio dado. Só admin, é a ação de maior
              alcance que existe no app. */}
          {isAdmin && (
            <div className="bg-surface border border-surface-3 rounded-xl p-6">
              <div className="flex items-center gap-2 mb-2">
                <ShieldCheck size={15} className="text-o2-green" />
                <h2 className="text-sm font-semibold text-ink uppercase tracking-wide">Exportar dados</h2>
              </div>
              <p className="text-xs text-ink-mid mb-4">
                Baixa um arquivo com tudo do squad — tarefas, clientes, reuniões, Meet Recaps, tratativas, fechamentos,
                automações e equipe. Fica de fora só o que é credencial de infraestrutura (senha/2FA de ERP dos
                clientes, senha de login, tokens de sessão) — quem precisar de senha de ERP continua revelando uma
                de cada vez, como já é hoje.
              </p>
              <button
                type="button"
                onClick={exportData}
                disabled={exporting}
                className="flex items-center gap-2 bg-surface-2 hover:bg-surface-3 border border-surface-3 text-ink font-medium py-2.5 px-4 rounded-xl transition-all text-sm disabled:opacity-50"
              >
                <Download size={15} className={exporting ? "animate-pulse" : ""} />
                {exporting ? "Gerando arquivo…" : "Exportar tudo (.json)"}
              </button>
            </div>
          )}

          {/* n8n webhook (visível só pra admin — é uma credencial) */}
          {isAdmin && (
            <div className="bg-surface border border-surface-3 rounded-xl p-6">
              <h2 className="text-sm font-semibold text-ink uppercase tracking-wide mb-2">Integração n8n</h2>
              <p className="text-xs text-ink-mid mb-4">
                Cole esse secret no header <code className="text-ink-soft">Authorization: Bearer &lt;secret&gt;</code> do seu workflow n8n. Cada squad tem o seu — itens recebidos entram como sugestão pendente em <span className="text-ink-soft">/sugestoes-ia</span>.
              </p>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={n8nSecret ?? "Carregando..."}
                  className="flex-1 bg-surface-2 border border-border rounded-lg px-3 py-2.5 text-sm text-ink font-mono placeholder:text-ink-ghost focus:outline-none"
                />
                <button
                  type="button"
                  onClick={copyN8nSecret}
                  disabled={!n8nSecret}
                  title="Copiar"
                  className="shrink-0 p-2.5 bg-surface-2 border border-border rounded-lg text-ink-mid hover:text-o2-green hover:border-o2-green/50 transition-colors disabled:opacity-50"
                >
                  <Copy size={16} />
                </button>
              </div>

              {!n8nConfirmRegen ? (
                <button
                  type="button"
                  onClick={() => setN8nConfirmRegen(true)}
                  className="mt-3 flex items-center gap-1.5 text-xs text-ink-faint hover:text-ink-mid transition-colors"
                >
                  <RefreshCw size={12} />
                  Gerar novo secret
                </button>
              ) : (
                <div className="mt-3 flex items-center gap-2 bg-red-400/10 rounded-lg px-3 py-2">
                  <p className="text-xs text-red-400 flex-1">Isso invalida o secret atual — o workflow n8n vai parar de funcionar até você atualizar o valor lá. Confirma?</p>
                  <button
                    type="button"
                    onClick={regenerateN8nSecret}
                    disabled={n8nRegenerating}
                    className="shrink-0 text-xs font-medium text-red-400 hover:underline disabled:opacity-50"
                  >
                    {n8nRegenerating ? "Gerando..." : "Confirmar"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setN8nConfirmRegen(false)}
                    className="shrink-0 text-xs text-ink-faint hover:text-ink-mid"
                  >
                    Cancelar
                  </button>
                </div>
              )}
            </div>
          )}
          {!isAdmin && (
            <p className="text-xs text-ink-faint px-1">A integração n8n é uma credencial de acesso — só admin do squad consegue ver/gerar.</p>
          )}

          <div className="bg-surface border border-surface-3 rounded-xl p-6">
            <h2 className="text-sm font-semibold text-ink uppercase tracking-wide mb-2 flex items-center gap-2">
              <Thermometer size={14} className="text-o2-green" />
              Critério de Temperatura (IA)
            </h2>
            <p className="text-xs text-ink-mid mb-4">
              Usado pela IA pra sugerir a Temperatura (🟢🟡🔴) e os Próximos Passos de cada
              reunião a partir da ata — a sugestão aparece na aba Reuniões de cada cliente
              pra você aprovar ou ajustar antes de virar oficial.
            </p>
            <AutoGrowTextarea
              value={temperaturePrompt}
              onChange={(e) => setTemperaturePrompt(e.target.value)}
              disabled={!isAdmin}
              rows={5}
              maxHeight={300}
              placeholder="ex.: 🟢 Bom: cliente satisfeito, sem pendências críticas..."
              className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2.5 text-sm text-ink placeholder:text-ink-ghost focus:outline-none focus:border-o2-green/50 font-mono disabled:opacity-70"
            />
            {isAdmin ? (
              <button
                type="button"
                onClick={saveTemperaturePrompt}
                disabled={temperaturePromptSaving}
                className="mt-3 flex items-center gap-1.5 bg-o2-green text-bg px-4 py-2 rounded-lg font-bold text-xs hover:bg-o2-green-bright transition-all disabled:opacity-50"
              >
                <Save size={13} />
                {temperaturePromptSaving ? "Salvando…" : "Salvar"}
              </button>
            ) : (
              <p className="text-xs text-ink-faint mt-2">Só admin do squad pode alterar.</p>
            )}
          </div>

          <div className="bg-surface border border-surface-3 rounded-xl p-6">
            <h2 className="text-sm font-semibold text-ink uppercase tracking-wide mb-2 flex items-center gap-2">
              <Mail size={14} className="text-o2-green" />
              Modelo de e-mail para o cliente (Revisão Semanal)
            </h2>
            <p className="text-xs text-ink-mid mb-4">
              Usado como ponto de partida do e-mail de pendências na aba &quot;E-mail&quot; da
              Revisão Semanal — <code>{"{{tarefas}}"}</code> vira a lista das tarefas marcadas
              naquela tela.
            </p>
            <AutoGrowTextarea
              value={clientEmailTemplate}
              onChange={(e) => setClientEmailTemplate(e.target.value)}
              disabled={!isAdmin}
              rows={8}
              maxHeight={400}
              placeholder={"Olá, tudo bem?\n\nSegue abaixo o resumo das pendências em aberto...\n\n{{tarefas}}"}
              className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2.5 text-sm text-ink placeholder:text-ink-ghost focus:outline-none focus:border-o2-green/50 font-mono disabled:opacity-70"
            />
            {isAdmin ? (
              <button
                type="button"
                onClick={saveClientEmailTemplate}
                disabled={clientEmailTemplateSaving}
                className="mt-3 flex items-center gap-1.5 bg-o2-green text-bg px-4 py-2 rounded-lg font-bold text-xs hover:bg-o2-green-bright transition-all disabled:opacity-50"
              >
                <Save size={13} />
                {clientEmailTemplateSaving ? "Salvando…" : "Salvar"}
              </button>
            ) : (
              <p className="text-xs text-ink-faint mt-2">Só admin do squad pode alterar.</p>
            )}
          </div>
        </div>
      )}

    </div>
  );
}
