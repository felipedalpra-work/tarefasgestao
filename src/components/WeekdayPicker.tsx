"use client";

import { cn } from "@/lib/utils";
import { WEEKDAY_LABELS, WEEKDAY_SHORT } from "@/lib/recurrence";

// Seletor de dias da semana da recorrência ("toda terça e sexta"). Usado na criação
// e na edição de tarefa — as duas telas precisam do mesmo controle.
export function WeekdayPicker({
  value,
  onChange,
  disabled,
}: {
  value: number[];
  onChange: (days: number[]) => void;
  disabled?: boolean;
}) {
  function toggle(day: number) {
    onChange(value.includes(day) ? value.filter((d) => d !== day) : [...value, day].sort((a, b) => a - b));
  }

  return (
    <div className="flex gap-1.5">
      {WEEKDAY_SHORT.map((label, day) => {
        const active = value.includes(day);
        return (
          <button
            key={day}
            type="button"
            disabled={disabled}
            onClick={() => toggle(day)}
            title={WEEKDAY_LABELS[day]}
            aria-pressed={active}
            aria-label={WEEKDAY_LABELS[day]}
            className={cn(
              "w-8 h-8 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50",
              active
                ? "bg-o2-green text-bg"
                : "bg-surface-2 border border-border text-ink-mid hover:text-ink hover:border-ink-ghost"
            )}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
