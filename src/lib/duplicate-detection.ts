import { prisma } from "./prisma";

function normalize(value: string): string {
  return value
    .toString()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// Checa se já existe algo "igual" (mesmo título normalizado + mesmo cliente) antes
// de uma sugestão nova entrar como pendente — usado tanto pelo processamento de Meet
// Recap quanto pelo webhook do n8n. Sem cliente identificado, não dá pra comparar com
// segurança, então não checa nada.
export async function findDuplicateNote(title: string, client: string | null): Promise<string | null> {
  const normTitle = normalize(title || "");
  const normClient = client ? normalize(client) : "";
  if (!normTitle || !normClient) return null;

  const [tasks, recapSuggestions, externalSuggestions] = await Promise.all([
    prisma.task.findMany({
      where: { status: { not: "done" }, client: { not: null } },
      select: { title: true, client: true },
    }),
    prisma.recapSuggestion.findMany({
      where: { status: "pending" },
      select: { title: true, recap: { select: { client: true, subject: true } } },
    }),
    prisma.externalSuggestion.findMany({
      where: { status: "pending", client: { not: null } },
      select: { title: true, client: true },
    }),
  ]);

  const taskMatch = tasks.find((t) => normalize(t.client || "") === normClient && normalize(t.title) === normTitle);
  if (taskMatch) {
    return `Já existe uma tarefa aberta com esse título${taskMatch.client ? ` (${taskMatch.client})` : ""}.`;
  }

  const recapMatch = recapSuggestions.find(
    (s) => normalize(s.recap.client || "") === normClient && normalize(s.title) === normTitle
  );
  if (recapMatch) {
    return `Já existe outra sugestão pendente de Meet Recap com esse título ("${recapMatch.recap.subject}").`;
  }

  const externalMatch = externalSuggestions.find(
    (s) => normalize(s.client || "") === normClient && normalize(s.title) === normTitle
  );
  if (externalMatch) {
    return `Já existe outra sugestão pendente do n8n com esse título.`;
  }

  return null;
}
