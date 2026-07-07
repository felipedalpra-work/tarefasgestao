"use client";

import { useSession, signIn } from "next-auth/react";
import { useEffect, useState } from "react";
import { CheckCircle2, Globe, Calendar, Mail, AlertCircle, MessageSquare, Send, Save } from "lucide-react";

type SquadUser = { id: string; name: string | null; email: string };

export default function SettingsPage() {
  const { data: session } = useSession();
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

  useEffect(() => {
    fetch("/api/settings/google-status")
      .then((r) => r.json())
      .then((d) => { setGoogleConnected(d.connected); setLoading(false); });

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

  async function connectGoogle() {
    await signIn("google", { callbackUrl: "/settings" });
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
    </div>
  );
}
