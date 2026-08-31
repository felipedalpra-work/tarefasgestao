// Recorrência de tarefa. Sem import de Prisma de propósito: a UI (NewTaskModal,
// TaskDetailPanel, TaskCard) usa as mesmas funções de rótulo/validação que a API.
//
// Convenção de data: `Task.dueDate` guarda só o DIA, como meia-noite UTC (ver
// `dueDateOnly` em src/lib/utils.ts). Toda conta aqui usa getters/setters UTC —
// com getters locais, um servidor em fuso negativo leria o dia anterior e o
// cálculo do dia da semana sairia errado por um dia.
//
// O horário do dia mora em `Task.dueTime` ("HH:MM", horário de Brasília), fora do
// dueDate, pra não mudar a semântica de dueDate no resto do app.

export const RECURRENCE_VALUES = ["weekly", "biweekly", "monthly", "weekdays"] as const;
export type Recurrence = (typeof RECURRENCE_VALUES)[number];

export const RECURRENCE_LABELS: Record<string, string> = {
  weekly: "Semanal",
  biweekly: "Quinzenal",
  monthly: "Mensal",
  weekdays: "Dias da semana",
};

// domingo primeiro, igual ao getUTCDay()/getDay() do JS
export const WEEKDAY_LABELS = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
export const WEEKDAY_SHORT = ["D", "S", "T", "Q", "Q", "S", "S"];

export function isValidRecurrence(value: unknown): value is Recurrence {
  return typeof value === "string" && (RECURRENCE_VALUES as readonly string[]).includes(value);
}

// "HH:MM" em 24h, que é o formato que o <input type="time"> manda
export function isValidTime(value: unknown): value is string {
  return typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

export function normalizeWeekdays(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  const days = value
    .map((d) => (typeof d === "number" ? d : Number(d)))
    .filter((d) => Number.isInteger(d) && d >= 0 && d <= 6);
  return [...new Set(days)].sort((a, b) => a - b);
}

function utcDayStart(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function addUtcDays(date: Date, days: number): Date {
  const d = utcDayStart(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

// Próxima ocorrência ESTRITAMENTE depois de `from`.
//
// Em "weekdays" ([2,5] = terça e sexta) o próximo dia é o primeiro da lista que
// vier depois de `from` — é isso que a recorrência antiga não conseguia expressar:
// ela só sabia somar 7/14/30 dias em cima da última data.
export function nextOccurrence(
  recurrence: string | null | undefined,
  weekdays: number[] | null | undefined,
  from: Date
): Date | null {
  if (!recurrence) return null;
  const base = utcDayStart(from);

  if (recurrence === "weekdays") {
    const days = normalizeWeekdays(weekdays);
    if (days.length === 0) return null; // sem dia escolhido não há série
    for (let i = 1; i <= 7; i++) {
      const candidate = addUtcDays(base, i);
      if (days.includes(candidate.getUTCDay())) return candidate;
    }
    return null; // inalcançável: 7 dias cobrem todos os dias da semana
  }

  if (recurrence === "weekly") return addUtcDays(base, 7);
  if (recurrence === "biweekly") return addUtcDays(base, 14);
  if (recurrence === "monthly") {
    const d = utcDayStart(base);
    d.setUTCMonth(d.getUTCMonth() + 1);
    return d;
  }
  return null;
}

// Primeira ocorrência de uma série nova, quando a pessoa marca recorrência mas não
// preenche prazo: hoje, se hoje já serve; senão o próximo dia válido. Sem isso a
// série nasce sem data e nada nunca é gerado nem lembrado.
export function firstOccurrence(
  recurrence: string | null | undefined,
  weekdays: number[] | null | undefined,
  today: Date
): Date | null {
  if (!recurrence) return null;
  const base = utcDayStart(today);
  if (recurrence === "weekdays") {
    const days = normalizeWeekdays(weekdays);
    if (days.length === 0) return null;
    if (days.includes(base.getUTCDay())) return base;
    return nextOccurrence(recurrence, days, base);
  }
  return base;
}

// "Terça e sexta às 09:00" / "Semanal às 09:00" / "Semanal" — usado tanto na tela
// quanto no texto da notificação, pra descrever a mesma coisa do mesmo jeito.
export function describeRecurrence(
  recurrence: string | null | undefined,
  weekdays: number[] | null | undefined,
  dueTime?: string | null
): string {
  if (!recurrence) return "";
  const time = isValidTime(dueTime) ? ` às ${dueTime}` : "";

  if (recurrence === "weekdays") {
    const days = normalizeWeekdays(weekdays);
    if (days.length === 0) return `Dias da semana (nenhum dia escolhido)`;
    if (days.length === 7) return `Todo dia${time}`;
    const names = days.map((d) => WEEKDAY_LABELS[d]);
    const list = names.length === 1 ? names[0] : `${names.slice(0, -1).join(", ")} e ${names[names.length - 1]}`;
    return `${list.charAt(0).toUpperCase()}${list.slice(1)}${time}`;
  }

  return `${RECURRENCE_LABELS[recurrence] ?? recurrence}${time}`;
}
