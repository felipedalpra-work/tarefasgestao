import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// minúsculo + sem acento + só alfanumérico/espaço — pra comparar nomes (cliente, título)
// sem exigir grafia idêntica. Postgres `contains`/`ILIKE` não ignora acento sozinho.
export function normalizeText(value: string): string {
  return value
    .toString()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function getInitials(name: string | null | undefined): string {
  if (!name) return "?";
  return name
    .split(" ")
    .slice(0, 2)
    .map((n) => n[0])
    .join("")
    .toUpperCase();
}

export function priorityColor(priority: string) {
  switch (priority) {
    case "high":
      return "text-red-400";
    case "medium":
      return "text-yellow-400";
    case "low":
      return "text-green-400";
    default:
      return "text-gray-400";
  }
}

export function statusLabel(status: string) {
  const map: Record<string, string> = {
    todo: "A fazer",
    in_progress: "Em andamento",
    blocked: "Bloqueado",
    done: "Concluído",
  };
  return map[status] || status;
}

export function priorityLabel(priority: string) {
  const map: Record<string, string> = {
    high: "Alta",
    medium: "Média",
    low: "Baixa",
  };
  return map[priority] || priority;
}

// dueDate representa só um dia (sem hora), mas fica salvo no banco como meia-noite UTC
// (o <input type="date"> manda "2026-07-28", e `new Date("2026-07-28")` sempre parseia como UTC).
// Ler os componentes com os getters locais (como o date-fns `format` e `toLocaleDateString` fazem)
// desloca o dia em fusos atrás de UTC — ex: Brasília (UTC-3) mostra o dia anterior.
// Esta função lê os componentes em UTC e reconstrói como meia-noite local, pra exibir/comparar
// o dia certo em qualquer fuso.
export function dueDateOnly(date: string | Date): Date {
  const d = new Date(date);
  return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

// O servidor roda em UTC (Vercel) e a operação é toda no Brasil: comparar um horário
// de tarefa ("09:00") com `new Date()` erraria em 3 horas, e "hoje" viraria o dia
// seguinte depois das 21h. Devolve o dia de hoje em Brasília já na convenção do
// `dueDate` (meia-noite UTC do dia, ver dueDateOnly) + quantos minutos do dia já
// passaram. Usa Intl em vez de somar -3h fixo pra não quebrar se o horário de verão
// voltar algum dia.
export function brtNow(now: Date = new Date()): { today: Date; minutesOfDay: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return {
    today: new Date(Date.UTC(get("year"), get("month") - 1, get("day"))),
    minutesOfDay: get("hour") * 60 + get("minute"),
  };
}

// "09:00" → 540. Retorna null se não for um horário válido.
export function timeToMinutes(time: string | null | undefined): number | null {
  if (!time || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return null;
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

export function isTaskOverdue(dueDate: string | Date | null | undefined, status: string): boolean {
  if (!dueDate || status === "done") return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return dueDateOnly(dueDate) < today;
}
