// Tipo compartilhado entre páginas e componentes de tarefa
export type TaskListItem = {
  id: string;
  title: string;
  description?: string | null;
  status: string;
  priority: string;
  dueDate?: string | Date | null;
  dueTime?: string | null; // "HH:MM" (horário de Brasília)
  client?: string | null;
  source: string;
  sortOrder?: number;
  recurrence?: string | null;
  recurrenceWeekdays?: number[] | null;
  deliverTo?: string | null;
  meetingTitle?: string | null;
  meetingDate?: string | Date | null;
  assignee?: { id: string; name?: string | null; image?: string | null } | null;
  subtasks?: { id: string; done: boolean }[];
  _count?: { links: number; comments: number };
};

export type UserOption = { id: string; name?: string | null; email: string };
