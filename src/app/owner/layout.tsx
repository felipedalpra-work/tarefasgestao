import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { isOwner } from "@/lib/authz";
import { SessionProvider } from "next-auth/react";
import { Toaster } from "@/components/Toaster";

// Fora do grupo (app) de propósito — não herda o Sidebar de squad, que não faz
// sentido numa visão de plataforma inteira. Guard próprio, mesmo padrão de
// (app)/layout.tsx: redireciona quem não está logado, e quem não é owner
// (isOwner — dimensão separada de role de squad) volta pro próprio dashboard.
export default async function OwnerLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session) redirect("/login");
  if (!isOwner(session)) redirect("/dashboard");

  return (
    <SessionProvider session={session}>
      <div className="min-h-screen bg-bg">{children}</div>
      <Toaster />
    </SessionProvider>
  );
}
