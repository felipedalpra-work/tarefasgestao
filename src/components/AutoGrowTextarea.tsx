"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

type Props = React.TextareaHTMLAttributes<HTMLTextAreaElement> & { maxHeight?: number };

// Cresce junto com o conteúdo (até maxHeight, aí passa a rolar por dentro) — em vez
// de altura fixa (rows) que corta o texto sem indicar que tem mais embaixo.
export function AutoGrowTextarea({ className, maxHeight = 320, value, defaultValue, ...props }: Props) {
  const ref = useRef<HTMLTextAreaElement>(null);

  function resize() {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, maxHeight)}px`;
    el.style.overflowY = el.scrollHeight > maxHeight ? "auto" : "hidden";
  }

  useEffect(resize, [value, defaultValue, maxHeight]);

  return (
    <textarea
      ref={ref}
      value={value}
      defaultValue={defaultValue}
      onInput={resize}
      {...props}
      className={cn("resize-none", className)}
    />
  );
}
