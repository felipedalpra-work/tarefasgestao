import { Suspense } from "react";
import ResetPasswordForm from "./reset-password-form";
import { LogoIcon } from "@/components/LogoIcon";

export default function ResetPasswordPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-bg px-4">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/3 w-96 h-96 bg-o2-green/5 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/3 w-64 h-64 bg-o2-green/3 rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-sm">
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2.5 mb-3">
            <LogoIcon className="w-10 h-10 text-o2-green shrink-0" />
            <span className="text-5xl font-black text-o2-green tracking-tighter">O2</span>
            <span className="text-lg text-ink-mid uppercase tracking-widest font-medium">Squad</span>
          </div>
          <p className="text-ink-faint text-sm">gestão fluída.</p>
        </div>

        <div className="bg-surface border border-surface-3 rounded-2xl p-8 shadow-2xl">
          <Suspense fallback={<p className="text-sm text-ink-mid">Carregando...</p>}>
            <ResetPasswordForm />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
