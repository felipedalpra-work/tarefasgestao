"use client";

import { useSession, signIn } from "next-auth/react";
import { useEffect, useState } from "react";
import { CheckCircle2, Globe, Calendar, Mail, AlertCircle, MessageSquare, Send, Save, UserPlus, Trash2, Sparkles, Copy, RefreshCw } from "lucide-react";
import { toast } from "@/components/Toaster";

type SquadUser = { id: string; name: string | null; email: string; cargo?: string | null; role?: string };

// Espelha NOTIFICATION_TYPES/DEFAULT_NOTIFICATION_PREFS de src/lib/settings.ts — duplicado
// aqui (não importado) porque aquele arquivo puxa o Prisma, que não pode ir pro bundle do client.
const DEFAULT_NOTIFICATION_PREFS: Record<string, boolean> = {
  taskAssigned: true,
  taskCompleted: true,
  taskReminder: true,
  commentMention: true,
  tratativaOverdue: true,
  onboardingDelay: false,
  fechamentoIncomplete: false,
  staleRecapSuggestions: false,
  weeklyDigest: true,
  meetingBriefing: true,
};

const NOTIFICATION_GROUPS: { title: string; items: { key: string; label: string; desc: string }[] }[] = [
  {
    title: "Tarefas",
    items: [
      { key: "taskAssigned", label: "Tarefa atribuída", desc: "Quando uma tarefa nova é atribuída a você" },
      { key: "taskCompleted", label: "Tarefa concluída", desc: "Parabenizando quem concluiu a tarefa" },
      { key: "taskReminder", label: "Lembrete manual", desc: "Botão \"Lembrar\" no detalhe da tarefa" },
      { key: "commentMention", label: "Menção em comentário", desc: "Quando alguém te marca com @nome" },
    ],
  },
  {
    title: "Lembretes automáticos",
    items: [
      { key: "tratativaOverdue", label: "Tratativa vencida", desc: "Prazo previsto de finalização vencido" },
      { key: "onboardingDelay", label: "Onboarding atrasado", desc: "Marco de onboarding (D+2..D+90) vencido" },
      { key: "fechamentoIncomplete", label: "Fechamento incompleto", desc: "Checklist do mês ainda pendente" },
      { key: "staleRecapSuggestions", label: "Sugestões da IA paradas", desc: "Pendente de revisão há mais de 3 dias" },
    ],
  },
  {
    title: "Resumos",
    items: [
      { key: "weeklyDigest", label: "Resumo semanal", desc: "Toda segunda de manhã" },
      { key: "meetingBriefing", label: "Briefing de reunião", desc: "Um dia antes de reunião com cliente" },
    ],
  },
];

export default function SettingsPage() {
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === "admin";
  const [googleConnected, setGoogleConnected] = useState(false);
  const [loading, setLoading] = useState(true);

  // Slack state
  const [users, setUsers] = useState<SquadUser[]>([]);
  const [slackToken, setSlackToken] = useState("");
  const [slackUserIds, setSlackUserIds] = useState<Record<string, string>>({});
  const [slackConfigured, setSlackConfigured] = useState(false);
  const [slackSaving, setSlackSaving] = useState(false);
  const [slackMsg, setSlackMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [notificationPrefs, setNotificationPrefs] = useState<Record<string, boolean>>(DEFAULT_NOTIFICATION_PREFS);
  const [notifSavingKey, setNotifSavingKey] = useState<string | null>(null);

  // Equipe state
  const [cargoDrafts, setCargoDrafts] = useState<Record<string, string>>({});
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [confirmingRemoveId, setConfirmingRemoveId] = useState<string | null>(null);
  const [newMember, setNewMember] = useState({ name: "", email: "", cargo: "", role: "member" });
  const [addingMember, setAddingMember] = useState(false);

  // Meet Recap suggestions state
  const [meetRecapEnabled, setMeetRecapEnabled] = useState(true);
  const [meetRecapSaving, setMeetRecapSaving] = useState(false);
  const [meetRecapGmailUserId, setMeetRecapGmailUserId] = useState<string | null>(null);
  const [meetRecapGmailSaving, setMeetRecapGmailSaving] = useState(false);

  // n8n webhook secret state
  const [n8nSecret, setN8nSecret] = useState<string | null>(null);
  const [n8nRegenerating, setN8nRegenerating] = useState(false);
  const [n8nConfirmRegen, setN8nConfirmRegen] = useState(false);

  // Minuta de cobrança (rascunho no Gmail) state
  const [billingDraftOwnerId, setBillingDraftOwnerId] = useState<string | null>(null);
  const [billingDraftSaving, setBillingDraftSaving] = useState(false);

  useEffect(() => {
    fetch("/api/settings/google-status")
      .then((r) => r.json())
      .then((d) => { setGoogleConnected(d.connected); setLoading(false); });

    fetch("/api/settings/meet-recap")
      .then((r) => r.json())
      .then((d) => { setMeetRecapEnabled(d.enabled); setMeetRecapGmailUserId(d.gmailUserId ?? null); });

    fetch("/api/settings/billing-draft")
      .then((r) => r.json())
      .then((d) => setBillingDraftOwnerId(d.ownerUserId ?? null));

    fetch("/api/settings/notifications")
      .then((r) => r.json())
      .then((d) => setNotificationPrefs((prev) => ({ ...prev, ...d })));

    // load squad users + slack settings in parallel
    Promise.all([
      fetch("/api/users").then((r) => r.json()),
      fetch("/api/settings/slack").then((r) => r.json()),
    ]).then(([usersData, slackData]) => {
      const list: SquadUser[] = Array.isArray(usersData) ? usersData : usersData.users ?? [];
      setUsers(list);
      if (slackData.configured) {
        setSlackConfigured(true);
        // token is masked — don't put it in the field so user knows it's saved
        const ids: Record<string, string> = {};
        list.forEach((u) => {
          const key = `slack_user_${u.id}`;
          if (slackData.settings?.[key]) ids[u.id] = slackData.settings[key];
        });
        setSlackUserIds(ids);
      }
    });
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

  async function toggleNotification(key: string, enabled: boolean) {
    setNotifSavingKey(key);
    const prev = notificationPrefs[key];
    setNotificationPrefs((p) => ({ ...p, [key]: enabled }));
    const res = await fetch("/api/settings/notifications", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: key, enabled }),
    });
    setNotifSavingKey(null);
    if (!res.ok) {
      setNotificationPrefs((p) => ({ ...p, [key]: prev }));
      toast("Erro ao salvar", "error");
    }
  }

  async function saveSlack() {
    setSlackSaving(true);
    setSlackMsg(null);
    const body: Record<string, string> = {};
    if (slackToken) body["slack_bot_token"] = slackToken;
    users.forEach((u) => {
      if (slackUserIds[u.id]) body[`slack_user_${u.id}`] = slackUserIds[u.id];
    });
    const res = await fetch("/api/settings/slack", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    setSlackSaving(false);
    if (res.ok) {
      setSlackConfigured(true);
      setSlackToken("");
      setSlackMsg({ type: "ok", text: "Configurações salvas com sucesso!" });
    } else {
      setSlackMsg({ type: "err", text: "Erro ao salvar. Tente novamente." });
    }
  }

  async function testSlack(userId: string) {
    const tokenToUse = slackToken;
    const slackId = slackUserIds[userId];
    if (!slackId) { setSlackMsg({ type: "err", text: "Informe o Slack User ID para testar." }); return; }
    if (!tokenToUse && !slackConfigured) { setSlackMsg({ type: "err", text: "Salve o token primeiro antes de testar." }); return; }
    setTestingId(userId);
    setSlackMsg(null);
    const body: Record<string, string> = { slackUserId: slackId };
    if (tokenToUse) body.botToken = tokenToUse;
    else {
      // fetch real token from server side — re-use PUT with just slackUserId, server reads token from DB
      // we pass botToken empty and server falls back to DB token
      body.botToken = "";
    }
    const res = await fetch("/api/settings/slack", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    setTestingId(null);
    const data = await res.json();
    setSlackMsg(data.ok ? { type: "ok", text: "Mensagem de teste enviada no Slack!" } : { type: "err", text: data.error || "Falha ao enviar. Verifique as configurações." });
  }

  async function saveCargo(userId: string) {
    const cargo = cargoDrafts[userId];
    if (cargo === undefined) return;
    const original = users.find((u) => u.id === userId)?.cargo || "";
    if (cargo === original) return;
    const res = await fetch(`/api/users/${userId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cargo }),
    });
    if (res.ok) {
      setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, cargo } : u)));
      toast("Cargo atualizado", "success");
    } else {
      toast("Erro ao salvar o cargo", "error");
    }
  }

  async function removeMember(userId: string) {
    setRemovingId(userId);
    const res = await fetch(`/api/users/${userId}`, { method: "DELETE" });
    setRemovingId(null);
    setConfirmingRemoveId(null);
    if (res.ok) {
      setUsers((prev) => prev.filter((u) => u.id !== userId));
      toast("Membro removido", "success");
    } else {
      const data = await res.json().catch(() => ({}));
      toast(data.error || "Erro ao remover", "error");
    }
  }

  async function addMember() {
    if (!newMember.email) { toast("Informe o e-mail", "error"); return; }
    setAddingMember(true);
    const res = await fetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newMember),
    });
    setAddingMember(false);
    if (res.ok) {
      const created = await res.json();
      setUsers((prev) => [...prev, created]);
      setNewMember({ name: "", email: "", cargo: "", role: "member" });
      toast("Membro adicionado", "success");
    } else {
      const data = await res.json().catch(() => ({}));
      toast(data.error || "Erro ao adicionar membro", "error");
    }
  }

  async function changeRole(userId: string, role: string) {
    const res = await fetch(`/api/users/${userId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role }),
    });
    if (res.ok) {
      setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, role } : u)));
      toast("Perfil atualizado", "success");
    } else {
      const data = await res.json().catch(() => ({}));
      toast(data.error || "Erro ao atualizar perfil", "error");
    }
  }

  return (
    <div className="p-4 md:p-8 max-w-2xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-ink">Configurações</h1>
        <p className="text-ink-mid text-sm mt-0.5">Gerencie suas integrações</p>
      </div>

      {/* Perfil */}
      <div className="bg-surface border border-surface-3 rounded-xl p-6 mb-4">
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

      {/* Meet Recap suggestions */}
      <div className="bg-surface border border-surface-3 rounded-xl p-6 mt-4">
        <h2 className="text-sm font-semibold text-ink uppercase tracking-wide mb-2">Meet Recaps (IA)</h2>
        <p className="text-xs text-ink-mid mb-6">
          Sugestão automática de tarefa a partir dos Meet Recaps do Gmail. Os recaps continuam sincronizando normalmente — isso só liga/desliga a IA gerar sugestões em <span className="text-ink-soft">/sugestoes-ia</span>. As tarefas do workflow n8n não são afetadas.
        </p>
        <label className="flex items-center gap-3 bg-surface-2 rounded-lg px-4 py-3 cursor-pointer">
          <input
            type="checkbox"
            checked={meetRecapEnabled}
            disabled={meetRecapSaving}
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
            disabled={meetRecapGmailSaving}
            onChange={(e) => saveMeetRecapGmailUser(e.target.value || null)}
            className="w-full sm:w-72 bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm text-ink focus:outline-none focus:border-o2-green/50"
          >
            <option value="">Todas as contas conectadas (não recomendado)</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>{u.name || u.email}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Minuta de cobrança */}
      <div className="bg-surface border border-surface-3 rounded-xl p-6 mt-4">
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

      {/* n8n webhook (visível só pra admin — é uma credencial) */}
      {isAdmin && (
        <div className="bg-surface border border-surface-3 rounded-xl p-6 mt-4">
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

      {/* Slack Integration */}
      <div className="bg-surface border border-surface-3 rounded-xl p-6 mt-4">
        <div className="flex items-center gap-2 mb-1">
          <h2 className="text-sm font-semibold text-ink uppercase tracking-wide">Integração Slack</h2>
          {slackConfigured && <CheckCircle2 size={14} className="text-o2-green" />}
        </div>
        <p className="text-xs text-ink-mid mb-6">
          Envie notificações automáticas no Slack quando uma tarefa for criada e atribuída.
        </p>

        {/* Bot Token */}
        <div className="mb-5">
          <label className="block text-xs text-ink-mid mb-1.5">Bot Token</label>
          <input
            type="password"
            placeholder={slackConfigured ? "••••••••••••• (salvo — cole para atualizar)" : "xoxb-00000000000-..."}
            value={slackToken}
            onChange={(e) => setSlackToken(e.target.value)}
            className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2.5 text-sm text-ink placeholder:text-ink-ghost focus:outline-none focus:border-o2-green/50"
          />
          <p className="text-xs text-ink-faint mt-1">
            Crie em <span className="text-o2-green/70">api.slack.com/apps</span> → OAuth &amp; Permissions → Bot Token Scopes: <code className="text-ink-mid">chat:write</code>
          </p>
        </div>

        {/* Slack User IDs per member */}
        <div className="mb-5">
          <label className="block text-xs text-ink-mid mb-2.5">Slack User ID por membro</label>
          <div className="space-y-2.5">
            {users.length === 0 ? (
              <div className="h-8 bg-surface-2 rounded-lg animate-pulse" />
            ) : users.map((u) => (
              <div key={u.id} className="flex items-center gap-3">
                <div className="w-7 h-7 rounded-full bg-o2-green/20 flex items-center justify-center text-o2-green text-xs font-bold shrink-0">
                  {(u.name || u.email)[0].toUpperCase()}
                </div>
                <span className="text-sm text-ink-soft w-28 shrink-0 truncate">{u.name || u.email}</span>
                <input
                  type="text"
                  placeholder="U0XXXXXXXXX"
                  value={slackUserIds[u.id] || ""}
                  onChange={(e) => setSlackUserIds((prev) => ({ ...prev, [u.id]: e.target.value }))}
                  className="flex-1 bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm text-ink placeholder:text-ink-ghost focus:outline-none focus:border-o2-green/50"
                />
                <button
                  onClick={() => testSlack(u.id)}
                  disabled={testingId === u.id || !slackUserIds[u.id]}
                  className="flex items-center gap-1.5 px-3 py-2 text-xs bg-surface-2 border border-border text-ink-mid rounded-lg hover:border-o2-green/50 hover:text-o2-green disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0"
                >
                  <Send size={12} />
                  {testingId === u.id ? "..." : "Testar"}
                </button>
              </div>
            ))}
          </div>
          <p className="text-xs text-ink-faint mt-2">
            Para encontrar o User ID: perfil do usuário no Slack → ⋯ → Copiar ID do membro
          </p>
        </div>

        {/* Feedback message */}
        {slackMsg && (
          <div className={`flex items-center gap-2 text-sm px-4 py-3 rounded-xl mb-4 ${slackMsg.type === "ok" ? "text-o2-green bg-o2-green/10" : "text-red-400 bg-red-400/10"}`}>
            {slackMsg.type === "ok" ? <CheckCircle2 size={15} /> : <AlertCircle size={15} />}
            {slackMsg.text}
          </div>
        )}

        {/* Notificações por tipo */}
        <div className="border-t border-surface-3 pt-5 mb-5">
          <h3 className="text-xs font-semibold text-ink-mid uppercase tracking-wide mb-1">Notificações por tipo</h3>
          <p className="text-xs text-ink-faint mb-4">
            Desative o que não quiser mais receber no Slack. A notificação in-app (sino) continua normalmente — isso só liga/desliga a mensagem no Slack.
          </p>
          <div className="space-y-5">
            {NOTIFICATION_GROUPS.map((group) => (
              <div key={group.title}>
                <p className="text-[10px] font-semibold text-ink-faint uppercase tracking-widest mb-2">{group.title}</p>
                <div className="space-y-1.5">
                  {group.items.map((item) => (
                    <label key={item.key} className="flex items-center gap-3 bg-surface-2 rounded-lg px-3 py-2.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={notificationPrefs[item.key]}
                        disabled={notifSavingKey === item.key}
                        onChange={(e) => toggleNotification(item.key, e.target.checked)}
                        className="accent-o2-green"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-ink">{item.label}</p>
                        <p className="text-[10px] text-ink-dim">{item.desc}</p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Save button */}
        <button
          onClick={saveSlack}
          disabled={slackSaving || (!slackToken && !slackConfigured && Object.keys(slackUserIds).length === 0)}
          className="w-full flex items-center justify-center gap-2 bg-o2-green text-bg font-bold py-3 px-4 rounded-xl hover:bg-o2-green-bright transition-all text-sm disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Save size={16} />
          {slackSaving ? "Salvando..." : "Salvar configurações Slack"}
        </button>
      </div>

      {/* Equipe */}
      <div className="bg-surface border border-surface-3 rounded-xl p-6 mt-4">
        <h2 className="text-sm font-semibold text-ink uppercase tracking-wide mb-2">Equipe</h2>
        <p className="text-xs text-ink-mid mb-6">Gerencie quem faz parte do squad e o cargo de cada um.</p>

        <div className="space-y-2.5 mb-6">
          {users.length === 0 ? (
            <div className="h-10 bg-surface-2 rounded-lg animate-pulse" />
          ) : users.map((u) => (
            <div key={u.id} className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-o2-green/20 flex items-center justify-center text-o2-green text-xs font-bold shrink-0">
                {(u.name || u.email)[0].toUpperCase()}
              </div>
              <div className="w-32 shrink-0">
                <p className="text-sm text-ink truncate">{u.name || u.email}</p>
                <p className="text-xs text-ink-faint truncate">{u.email}</p>
              </div>
              <input
                type="text"
                placeholder="Cargo (ex: CFO)"
                value={cargoDrafts[u.id] ?? u.cargo ?? ""}
                onChange={(e) => setCargoDrafts((prev) => ({ ...prev, [u.id]: e.target.value }))}
                onBlur={() => saveCargo(u.id)}
                className="flex-1 bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm text-ink placeholder:text-ink-ghost focus:outline-none focus:border-o2-green/50"
              />
              {isAdmin ? (
                <select
                  value={u.role ?? "member"}
                  onChange={(e) => changeRole(u.id, e.target.value)}
                  className="w-28 shrink-0 bg-surface-2 border border-border rounded-lg px-2 py-2 text-xs text-ink focus:outline-none focus:border-o2-green/50"
                >
                  <option value="member">Membro</option>
                  <option value="admin">Admin</option>
                </select>
              ) : (
                <span className="w-28 shrink-0 text-xs text-ink-faint text-center">
                  {u.role === "admin" ? "Admin" : "Membro"}
                </span>
              )}
              {!isAdmin ? null : confirmingRemoveId === u.id ? (
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="text-xs text-ink-mid">Remover mesmo?</span>
                  <button
                    onClick={() => removeMember(u.id)}
                    disabled={removingId === u.id}
                    className="text-xs px-2.5 py-1.5 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 disabled:opacity-50"
                  >
                    {removingId === u.id ? "..." : "Sim"}
                  </button>
                  <button
                    onClick={() => setConfirmingRemoveId(null)}
                    className="text-xs px-2.5 py-1.5 rounded-lg bg-surface-2 border border-border text-ink-mid hover:text-ink"
                  >
                    Cancelar
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmingRemoveId(u.id)}
                  className="p-2 text-ink-faint hover:text-red-400 transition-colors shrink-0"
                  title="Remover da equipe"
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          ))}
        </div>

        {isAdmin && (
          <div className="border-t border-border pt-5">
            <p className="text-xs text-ink-mid mb-2.5">Adicionar membro</p>
            <div className="flex items-center gap-2">
              <input
                type="text"
                placeholder="Nome"
                value={newMember.name}
                onChange={(e) => setNewMember((prev) => ({ ...prev, name: e.target.value }))}
                className="w-28 bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm text-ink placeholder:text-ink-ghost focus:outline-none focus:border-o2-green/50"
              />
              <input
                type="email"
                placeholder="E-mail"
                value={newMember.email}
                onChange={(e) => setNewMember((prev) => ({ ...prev, email: e.target.value }))}
                className="w-44 bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm text-ink placeholder:text-ink-ghost focus:outline-none focus:border-o2-green/50"
              />
              <input
                type="text"
                placeholder="Cargo"
                value={newMember.cargo}
                onChange={(e) => setNewMember((prev) => ({ ...prev, cargo: e.target.value }))}
                className="flex-1 bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm text-ink placeholder:text-ink-ghost focus:outline-none focus:border-o2-green/50"
              />
              <select
                value={newMember.role}
                onChange={(e) => setNewMember((prev) => ({ ...prev, role: e.target.value }))}
                className="w-28 shrink-0 bg-surface-2 border border-border rounded-lg px-2 py-2 text-xs text-ink focus:outline-none focus:border-o2-green/50"
              >
                <option value="member">Membro</option>
                <option value="admin">Admin</option>
              </select>
              <button
                onClick={addMember}
                disabled={addingMember || !newMember.email}
                className="flex items-center gap-1.5 px-3 py-2 text-xs bg-o2-green/10 text-o2-green rounded-lg hover:bg-o2-green/20 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0"
              >
                <UserPlus size={13} />
                {addingMember ? "..." : "Adicionar"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
