import type { Session } from "next-auth";

// Rotas de configuração do squad (convidar/remover membro, Slack, Gmail, secret
// do n8n) só podem ser mexidas por quem é admin (o CFO) — membro comum não.
export function isAdmin(session: Session | null): boolean {
  return session?.user?.role === "admin";
}
