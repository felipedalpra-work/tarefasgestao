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

export function isTaskOverdue(dueDate: string | Date | null | undefined, status: string): boolean {
  if (!dueDate || status === "done") return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return dueDateOnly(dueDate) < today;
}
