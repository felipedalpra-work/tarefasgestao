"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { UserPlus, Trash2, Copy, Crown, X, Check } from "lucide-react";
import { toast } from "@/components/Toaster";
import { UserAvatar } from "@/components/UserAvatar";
import { cn } from "@/lib/utils";

type SquadMember = { id: string; name: string | null; email: string; image?: string | null; cargo?: string | null; role?: string };

type Tab = "org" | "membros" | "permissoes";

// Referência fixa — não vem do banco, é a regra de negócio documentada (a única
// checagem real é isAdmin, ver src/lib/authz.ts). Manter em sincronia manualmente
// se uma ação nova virar admin-only.
const ADMIN_ONLY = [
  "Convidar, remover e promover/rebaixar membro do squad",
  "Configurar Slack (bot token, notificações), Meet Recap Gmail, Minuta de cobrança e secret do n8n",
  "Excluir um cliente (ação irreversível — apaga tudo ligado a ele)",
  "Pausar, reativar ou rodar uma automação agora",
];
const ANYONE = [
  "Criar, editar e concluir tarefas — inclusive de outras pessoas",
  "Criar e editar clientes, tratativas, onboarding e fechamento mensal",
  "Revisar sugestões da IA (Meet Recap / n8n) e usar o assistente de IA",
  "Editar o próprio cargo de exibição",
];

export function EquipeClient({ initialUsers }: { initialUsers: SquadMember[] }) {
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === "admin";

  const [tab, setTab] = useState<Tab>("org");
  const [users, setUsers] = useState<SquadMember[]>(initialUsers);
  const [slackConfigured, setSlackConfigured] = useState(false);

  // Organograma (só visualização)
  const [viewingId, setViewingId] = useState<string | null>(null);

  // Membros (gestão)
  const [cargoDrafts, setCargoDrafts] = useState<Record<string, string>>({});
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [confirmingRemoveId, setConfirmingRemoveId] = useState<string | null>(null);
  const [newMember, setNewMember] = useState({ name: "", email: "", cargo: "", role: "member", slackUserId: "" });
  const [addingMember, setAddingMember] = useState(false);
  const [lastInvite, setLastInvite] = useState<{ email: string; url: string; slackSent: boolean } | null>(null);

  useEffect(() => {
    fetch("/api/settings/slack")
      .then((r) => r.json())
      .then((d) => setSlackConfigured(!!d.configured));
  }, []);

  const admins = users.filter((u) => u.role === "admin");
  const members = users.filter((u) => u.role !== "admin");
  const viewingUser = users.find((u) => u.id === viewingId) ?? null;

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
      const { inviteUrl, slackSent, ...created } = await res.json();
      setUsers((prev) => [...prev, created]);
      setLastInvite({ email: created.email, url: inviteUrl, slackSent });
      setNewMember({ name: "", email: "", cargo: "", role: "member", slackUserId: "" });
      toast(slackSent ? "Membro adicionado e convite enviado no Slack" : "Membro adicionado — copie o link de convite abaixo", "success");
    } else {
      const data = await res.json().catch(() => ({}));
      toast(data.error || "Erro ao adicionar membro", "error");
    }
  }

  function copyInviteLink() {
    if (!lastInvite) return;
    navigator.clipboard.writeText(lastInvite.url);
    toast("Link copiado", "success");
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <button
          onClick={() => setTab("org")}
          className={cn(
            "text-xs font-medium px-3 py-1.5 rounded-full transition-colors",
            tab === "org" ? "bg-o2-green/15 text-o2-green" : "bg-surface-2 text-ink-mid hover:text-ink"
          )}
        >
          Organograma
        </button>
        <button
          onClick={() => setTab("membros")}
          className={cn(
            "text-xs font-medium px-3 py-1.5 rounded-full transition-colors",
            tab === "membros" ? "bg-o2-green/15 text-o2-green" : "bg-surface-2 text-ink-mid hover:text-ink"
          )}
        >
          Membros ({users.length})
        </button>
        <button
          onClick={() => setTab("permissoes")}
          className={cn(
            "text-xs font-medium px-3 py-1.5 rounded-full transition-colors",
            tab === "permissoes" ? "bg-o2-green/15 text-o2-green" : "bg-surface-2 text-ink-mid hover:text-ink"
          )}
        >
          Permissões
        </button>
      </div>

      {tab === "org" && (
        <div className="space-y-6">
          {/* Organograma — só visualização, clique num card só mostra os detalhes */}
          <div className="bg-surface border border-surface-3 rounded-2xl p-8 md:p-12 overflow-x-auto">
            <div className="flex flex-col items-center min-w-max">
              <div className="flex gap-6 flex-wrap justify-center">
                {admins.map((u) => (
                  <MemberNode key={u.id} user={u} isAdminTier selected={viewingId === u.id} onClick={() => setViewingId((id) => (id === u.id ? null : u.id))} />
                ))}
              </div>

              {members.length > 0 && (
                <>
                  <div className="w-px h-8 bg-border" />
                  <div className="inline-flex flex-col items-center">
                    <div className={cn("flex gap-6 flex-wrap justify-center pt-8", members.length > 1 && "border-t border-border")}>
                      {members.map((u) => (
                        <div key={u.id} className="relative">
                          {members.length > 1 && (
                            <div className="absolute -top-8 left-1/2 -translate-x-1/2 w-px h-8 bg-border" />
                          )}
                          <MemberNode user={u} selected={viewingId === u.id} onClick={() => setViewingId((id) => (id === u.id ? null : u.id))} />
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>

          {viewingUser && (
            <div className="bg-surface border border-surface-3 rounded-xl p-6 animate-fade-in">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <UserAvatar name={viewingUser.name} image={viewingUser.image} size="lg" />
                  <div>
                    <p className="font-medium text-ink">{viewingUser.name || viewingUser.email}</p>
                    <p className="text-xs text-ink-faint">{viewingUser.email}</p>
                    <p className="text-xs text-ink-mid mt-1">
                      {viewingUser.cargo ? `${viewingUser.cargo} · ` : ""}{viewingUser.role === "admin" ? "Admin" : "Membro"}
                    </p>
                  </div>
                </div>
                <button onClick={() => setViewingId(null)} className="text-ink-faint hover:text-ink p-1">
                  <X size={16} />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {tab === "membros" && (
        <div className="bg-surface border border-surface-3 rounded-xl p-6">
          <p className="text-xs text-ink-mid mb-6">Gerencie quem faz parte do squad e o cargo de cada um.</p>

          <div className="space-y-2.5 mb-6">
            {users.length === 0 ? (
              <div className="h-10 bg-surface-2 rounded-lg animate-pulse" />
            ) : users.map((u) => (
              <div key={u.id} className="flex items-center gap-3">
                <UserAvatar name={u.name} image={u.image} size="sm" />
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
              <div className="flex flex-wrap items-center gap-2">
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
                  className="flex-1 min-w-24 bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm text-ink placeholder:text-ink-ghost focus:outline-none focus:border-o2-green/50"
                />
                {slackConfigured && (
                  <input
                    type="text"
                    placeholder="Slack ID (p/ mandar convite)"
                    value={newMember.slackUserId}
                    onChange={(e) => setNewMember((prev) => ({ ...prev, slackUserId: e.target.value }))}
                    className="w-44 bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm text-ink placeholder:text-ink-ghost focus:outline-none focus:border-o2-green/50"
                  />
                )}
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
              {slackConfigured && (
                <p className="text-xs text-ink-faint mt-1.5">Informando o Slack ID, o convite já é mandado por DM assim que a pessoa for adicionada.</p>
              )}

              {lastInvite && (
                <div className="mt-3 bg-surface-2 rounded-lg px-4 py-3">
                  <p className="text-xs text-ink-mid mb-2">
                    {lastInvite.slackSent
                      ? <>Convite enviado por DM no Slack pra <strong className="text-ink-soft">{lastInvite.email}</strong>. Se quiser, também dá pra mandar o link direto:</>
                      : <>Copie o link abaixo e envie pra <strong className="text-ink-soft">{lastInvite.email}</strong> por onde preferir (Slack, WhatsApp etc.):</>}
                  </p>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      readOnly
                      value={lastInvite.url}
                      className="flex-1 bg-surface border border-border rounded-lg px-3 py-2 text-xs text-ink font-mono focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={copyInviteLink}
                      className="shrink-0 p-2 bg-surface border border-border rounded-lg text-ink-mid hover:text-o2-green hover:border-o2-green/50 transition-colors"
                      title="Copiar"
                    >
                      <Copy size={14} />
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {tab === "permissoes" && (
        <div className="grid sm:grid-cols-2 gap-4">
          <div className="bg-surface border border-surface-3 rounded-xl p-6">
            <div className="flex items-center gap-2 mb-4">
              <Crown size={14} className="text-yellow-400" />
              <h2 className="text-sm font-semibold text-ink uppercase tracking-wide">Admin</h2>
            </div>
            <ul className="space-y-3">
              {ADMIN_ONLY.map((item) => (
                <li key={item} className="flex items-start gap-2 text-sm text-ink-soft">
                  <Check size={14} className="text-o2-green shrink-0 mt-0.5" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <div className="bg-surface border border-surface-3 rounded-xl p-6">
            <h2 className="text-sm font-semibold text-ink uppercase tracking-wide mb-4">Membro</h2>
            <ul className="space-y-3">
              {ANYONE.map((item) => (
                <li key={item} className="flex items-start gap-2 text-sm text-ink-soft">
                  <Check size={14} className="text-o2-green shrink-0 mt-0.5" />
                  {item}
                </li>
              ))}
            </ul>
            <p className="text-xs text-ink-faint mt-4 pt-4 border-t border-surface-3">
              Membro também tem acesso a tudo isso — só não mexe em configuração do squad.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function MemberNode({
  user,
  isAdminTier,
  selected,
  onClick,
}: {
  user: SquadMember;
  isAdminTier?: boolean;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex flex-col items-center gap-2 w-32 p-4 rounded-2xl border transition-all hover:-translate-y-1 hover:shadow-lg",
        selected ? "border-o2-green bg-o2-green/5" : "border-surface-3 bg-surface-2 hover:border-o2-green/40"
      )}
    >
      <div className="relative">
        <UserAvatar name={user.name} image={user.image} size="lg" />
        {isAdminTier && (
          <Crown size={12} className="absolute -top-1.5 -right-1.5 text-yellow-400 bg-surface rounded-full p-0.5" />
        )}
      </div>
      <div className="w-full text-center">
        <p className="text-sm font-medium text-ink truncate">{user.name || user.email}</p>
        <p className="text-xs text-ink-faint truncate">{user.cargo || (isAdminTier ? "Admin" : "Membro")}</p>
      </div>
    </button>
  );
}
