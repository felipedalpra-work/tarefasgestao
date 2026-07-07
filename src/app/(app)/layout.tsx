import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Sidebar } from "@/components/Sidebar";
import { SessionProvider } from "next-auth/react";
import { Toaster } from "@/components/Toaster";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session) redirect("/login");

  return (
    <SessionProvider session={session}>
      <div className="flex h-screen overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-y-auto bg-bg pt-14 md:pt-0">
          {children}
        </main>
      </div>
      <Toaster />
    </SessionProvider>
  );
}
