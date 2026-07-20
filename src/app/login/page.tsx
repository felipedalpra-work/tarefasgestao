import { Suspense } from "react";
import LoginForm from "./login-form";
import { LogoIcon } from "@/components/LogoIcon";
import { LoginFX, TiltCard } from "@/components/LoginFX";

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-bg px-4">
      <LoginFX />

      <div className="relative w-full max-w-sm">
        <div className="text-center mb-10 animate-login-enter">
          <div className="inline-flex items-center gap-2.5 mb-3">
            <LogoIcon className="w-10 h-10 text-o2-green shrink-0 animate-logo-breathe" />
            <span className="text-5xl font-black text-o2-green tracking-tighter">O2</span>
            <span className="text-lg text-ink-mid uppercase tracking-widest font-medium">Squad</span>
          </div>
          <p className="text-ink-faint text-sm">Organização do Squad</p>
        </div>

        <TiltCard className="animate-login-enter [animation-delay:0.12s]">
          <div className="bg-surface border border-surface-3 rounded-2xl p-8 shadow-2xl">
            <Suspense fallback={<p className="text-sm text-ink-mid">Carregando...</p>}>
              <LoginForm />
            </Suspense>
          </div>
        </TiltCard>
      </div>
    </div>
  );
}
