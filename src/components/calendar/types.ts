import type { UserOption } from "@/types/task";

export type Task = {
  id: string;
  title: string;
  status: string;
  dueDate: string | null;
  dueTime: string | null;
  client?: string | null;
  assignee: { id: string; name: string | null } | null;
};

export type CalendarEvent = {
  id: string;
  title: string;
  client: string;
  startAt: string;
  endAt: string;
  briefingSent: boolean;
  attendeeUserIds: string[];
  o2Tasks: Task[];
  clientTasks: Task[];
};

export type { UserOption };

export type CalendarView = "day" | "week" | "month" | "schedule";

export function getMondayOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
}

export function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

export function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

export function toDateParam(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function parseDateParam(value: string): Date {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}
