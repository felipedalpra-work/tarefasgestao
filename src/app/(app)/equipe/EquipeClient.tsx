"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { UserPlus, Trash2, Copy, Crown, X } from "lucide-react";
import { toast } from "@/components/Toaster";
import { UserAvatar } from "@/components/UserAvatar";
import { cn } from "@/lib/utils";

type SquadMember = { id: string; name: string | null; email: string; image?: string | null; cargo?: string | null; role?: string };

type Panel = { type: "none" } | { type: "edit"; userId: string } | { type: "add" };

export function EquipeClient({ initialUsers }: { initialUsers: SquadMember[] }) {
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === "admin";

  const [users, setUsers] = useState<SquadMember[]>(initialUsers);
  const [slackConfigured, setSlackConfigured] = useState(false);
  const [panel, setPanel] = useState<Panel>({ type: "none" });

  const [cargoDrafts, setCargoDrafts] = useState<Record<string, string>>({});
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [confirmingRemove, setConfirmingRemove] = useState(false);
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
  const selectedUser = panel.type === "edit" ? users.find((u) => u.id === panel.userId) ?? null : null;

  function openEdit(userId: string) {
    setConfirmingRemove(false);
    setPanel((prev) => (prev.type === "edit" && prev.userId === userId ? { type: "none" } : { type: "edit", userId }));
  }

  function closePanel() {
    setConfirmingRemove(false);
    setPanel({ type: "none" });
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
    setConfirmingRemove(false);
    if (res.ok) {
      setUsers((prev) => prev.filter((u) => u.id !== userId));
      toast("Membro removido", "success");
      closePanel();
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
      {/* Organograma */}
      <div className="bg-surface border border-surface-3 rounded-2xl p-8 md:p-12 overflow-x-auto">
        <div className="flex flex-col items-center min-w-max">
          <div className="flex gap-6 flex-wrap justify-center">
            {admins.map((u) => (
              <MemberNode
                key={u.id}
                user={u}
                isAdminTier
                selected={panel.type === "edit" && panel.userId === u.id}
                onClick={() => openEdit(u.id)}
              />
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
                      <MemberNode
                        user={u}
                        selected={panel.type === "edit" && panel.userId === u.id}
                        onClick={() => openEdit(u.id)}
                      />
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          {isAdmin && (
            <>
              <div className="w-px h-8 bg-border" />
              <button
                onClick={() => setPanel((prev) => (prev.type === "add" ? { type: "none" } : { type: "add" }))}
                className={cn(
                  "flex flex-col items-center justify-center gap-1.5 w-32 h-[104px] rounded-2xl border border-dashed transition-all",
                  panel.type === "add"
                    ? "border-o2-green text-o2-green bg-o2-green/5"
                    : "border-border text-ink-faint hover:text-o2-green hover:border-o2-green/50"
                )}
              >
                <UserPlus size={18} />
                <span className="text-xs font-medium">Adicionar</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Painel: editar membro selecionado */}
      {panel.type === "edit" && selectedUser && (
        <div className="bg-surface border border-surface-3 rounded-xl p-6 animate-fade-in">
          <div className="flex items-start justify-between mb-5">
            <div className="flex items-center gap-3">
              <UserAvatar name={selectedUser.name} image={selectedUser.image} size="lg" />
              <div>
                <p className="font-medium text-ink">{selectedUser.name || selectedUser.email}</p>
                <p className="text-xs text-ink-faint">{selectedUser.email}</p>
              </div>
            </div>
            <button onClick={closePanel} className="text-ink-faint hover:text-ink p-1">
              <X size={16} />
            </button>
          </div>

          <div className="grid sm:grid-cols-2 gap-4 mb-5">
            <div>
              <label className="text-xs font-medium text-ink-mid uppercase tracking-wide">Cargo</label>
              <input
                type="text"
                placeholder="Cargo (ex: CFO)"
                value={cargoDrafts[selectedUser.id] ?? selectedUser.cargo ?? ""}
                onChange={(e) => setCargoDrafts((prev) => ({ ...prev, [selectedUser.id]: e.target.value }))}
                onBlur={() => saveCargo(selectedUser.id)}
                className="mt-1.5 w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm text-ink placeholder:text-ink-ghost focus:outline-none focus:border-o2-green/50"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-ink-mid uppercase tracking-wide">Perfil</label>
              {isAdmin ? (
                <select
                  value={selectedUser.role ?? "member"}
                  onChange={(e) => changeRole(selectedUser.id, e.target.value)}
                  className="mt-1.5 w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm text-ink focus:outline-none focus:border-o2-green/50"
                >
                  <option value="member">Membro</option>
                  <option value="admin">Admin</option>
                </select>
              ) : (
                <p className="mt-1.5 text-sm text-ink-mid">{selectedUser.role === "admin" ? "Admin" : "Membro"}</p>
              )}
            </div>
          </div>

          {isAdmin && (
            confirmingRemove ? (
              <div className="flex items-center gap-2 bg-red-400/10 rounded-lg px-3 py-2.5">
                <span className="text-xs text-red-400 flex-1">Remover {selectedUser.name || selectedUser.email} da equipe?</span>
                <button
                  onClick={() => removeMember(selectedUser.id)}
                  disabled={removingId === selectedUser.id}
                  className="text-xs px-2.5 py-1.5 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 disabled:opacity-50 shrink-0"
                >
                  {removingId === selectedUser.id ? "..." : "Sim, remover"}
                </button>
                <button onClick={() => setConfirmingRemove(false)} className="text-xs px-2.5 py-1.5 rounded-lg bg-surface-2 border border-border text-ink-mid hover:text-ink shrink-0">
                  Cancelar
                </button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmingRemove(true)}
                className="flex items-center gap-1.5 text-xs text-ink-faint hover:text-red-400 transition-colors"
              >
                <Trash2 size={13} />
                Remover da equipe
              </button>
            )
          )}
        </div>
      )}

      {/* Painel: adicionar membro */}
      {panel.type === "add" && isAdmin && (
        <div className="bg-surface border border-surface-3 rounded-xl p-6 animate-fade-in">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-ink uppercase tracking-wide">Adicionar membro</h2>
            <button onClick={closePanel} className="text-ink-faint hover:text-ink p-1">
              <X size={16} />
            </button>
          </div>

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
