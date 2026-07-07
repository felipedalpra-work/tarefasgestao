"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, AlertCircle, Info, X } from "lucide-react";
import { cn } from "@/lib/utils";

type ToastType = "success" | "error" | "info";
type Toast = { id: number; type: ToastType; message: string };

// Dispara um toast de qualquer client component, sem precisar de context
export function toast(message: string, type: ToastType = "info") {
  window.dispatchEvent(new CustomEvent("o2-toast", { detail: { message, type } }));
}

const ICONS: Record<ToastType, React.ElementType> = {
  success: CheckCircle2,
  error: AlertCircle,
  info: Info,
};

const STYLES: Record<ToastType, string> = {
  success: "border-o2-green/30 text-o2-green",
  error: "border-red-400/30 text-red-400",
  info: "border-border text-ink-soft",
};

export function Toaster() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    let counter = 0;
    const handler = (e: Event) => {
      const { message, type } = (e as CustomEvent).detail;
      const id = ++counter;
      setToasts((prev) => [...prev, { id, message, type }]);
      setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4500);
    };
    window.addEventListener("o2-toast", handler);
    return () => window.removeEventListener("o2-toast", handler);
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 max-w-sm w-full pointer-events-none">
      {toasts.map((t) => {
        const Icon = ICONS[t.type];
        return (
          <div
            key={t.id}
            className={cn(
              "pointer-events-auto flex items-start gap-2.5 bg-surface border rounded-xl px-4 py-3 shadow-2xl animate-slide-in-up",
              STYLES[t.type]
            )}
          >
            <Icon size={15} className="shrink-0 mt-0.5" />
            <p className="text-xs text-ink leading-relaxed flex-1">{t.message}</p>
            <button
              onClick={() => setToasts((prev) => prev.filter((x) => x.id !== t.id))}
              className="text-ink-faint hover:text-ink shrink-0"
            >
              <X size={13} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
