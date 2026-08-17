import type { Session } from "next-auth";

// Rotas de configuração do squad (convidar/remover membro, Slack, Gmail, secret
// do n8n) só podem ser mexidas por quem é admin (o CFO) — membro comum não.
export function isAdmin(session: Session | null): boolean {
  return session?.user?.role === "admin";
}

// Dono da plataforma (cross-squad) — dimensão totalmente separada do role de
// squad (admin/member): alguém pode ser owner mesmo sendo "member" do próprio
// squad. Concedido só manualmente (model PlatformOwner), nunca por UI.
export function isOwner(session: Session | null): boolean {
  return session?.user?.isOwner === true;
}
