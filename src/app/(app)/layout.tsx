import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { Sidebar } from "@/components/Sidebar";
import { SessionProvider } from "next-auth/react";
import { Toaster } from "@/components/Toaster";
import { AiAssistant } from "@/components/AiAssistant";
import { OnboardingGate } from "@/components/OnboardingGate";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session) redirect("/login");

  const [user, squad] = await Promise.all([
    prisma.user.findUnique({ where: { id: session.user.id }, select: { onboardingCompletedAt: true } }),
    prisma.squad.findUnique({ where: { id: session.user.squadId }, select: { name: true } }),
  ]);

  return (
    <SessionProvider session={session}>
      <div className="flex h-screen overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-y-auto bg-bg pt-14 md:pt-0">
          {children}
        </main>
      </div>
      <Toaster />
      <AiAssistant />
      <OnboardingGate needsOnboarding={!user?.onboardingCompletedAt} squadName={squad?.name || "seu squad"} isAdmin={session.user.role === "admin"} />
    </SessionProvider>
  );
}
