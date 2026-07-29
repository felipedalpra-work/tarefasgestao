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

// Reuniões recorrentes (semanais/mensais) com o mesmo cliente tendem a gerar o mesmo
// título genérico toda vez ("Enviar relatório mensal", "Follow-up com cliente") — só
// comparar título+cliente marcava toda ocorrência nova como duplicata de uma antiga,
// mesmo sendo semanas/meses depois. Por isso também exige que as datas (prazo, ou
// criação se não tiver prazo) estejam próximas — só conta como duplicata de verdade
// dentro dessa janela.
const DUPLICATE_WINDOW_MS = 14 * 24 * 60 * 60 * 1000; // ~2 semanas

function referenceDate(dueDate: Date | null, createdAt: Date): Date {
  return dueDate ?? createdAt;
}

function isNearInTime(a: Date, b: Date): boolean {
  return Math.abs(a.getTime() - b.getTime()) <= DUPLICATE_WINDOW_MS;
}

// Checa se já existe algo "igual" (mesmo título normalizado + mesmo cliente + prazo/criação
// próximos) antes de uma sugestão nova entrar como pendente — usado tanto pelo processamento
// de Meet Recap quanto pelo webhook do n8n. Sem cliente identificado, não dá pra comparar com
// segurança, então não checa nada.
export async function findDuplicateNote(
  title: string,
  client: string | null,
  dueDate?: Date | null
): Promise<string | null> {
  const normTitle = normalize(title || "");
  const normClient = client ? normalize(client) : "";
  if (!normTitle || !normClient) return null;

  const newRef = dueDate ?? new Date();

  const [tasks, recapSuggestions, externalSuggestions] = await Promise.all([
    prisma.task.findMany({
      where: { status: { not: "done" }, client: { not: null } },
      select: { title: true, client: true, dueDate: true, createdAt: true },
    }),
    prisma.recapSuggestion.findMany({
      where: { status: "pending" },
      select: { title: true, dueDate: true, createdAt: true, recap: { select: { client: true, subject: true } } },
    }),
    prisma.externalSuggestion.findMany({
      where: { status: "pending", client: { not: null } },
      select: { title: true, client: true, dueDate: true, createdAt: true },
    }),
  ]);

  const taskMatch = tasks.find(
    (t) =>
      normalize(t.client || "") === normClient &&
      normalize(t.title) === normTitle &&
      isNearInTime(referenceDate(t.dueDate, t.createdAt), newRef)
  );
  if (taskMatch) {
    return `Já existe uma tarefa aberta com esse título${taskMatch.client ? ` (${taskMatch.client})` : ""}.`;
  }

  const recapMatch = recapSuggestions.find(
    (s) =>
      normalize(s.recap.client || "") === normClient &&
      normalize(s.title) === normTitle &&
      isNearInTime(referenceDate(s.dueDate, s.createdAt), newRef)
  );
  if (recapMatch) {
    return `Já existe outra sugestão pendente de Meet Recap com esse título ("${recapMatch.recap.subject}").`;
  }

  const externalMatch = externalSuggestions.find(
    (s) =>
      normalize(s.client || "") === normClient &&
      normalize(s.title) === normTitle &&
      isNearInTime(referenceDate(s.dueDate, s.createdAt), newRef)
  );
  if (externalMatch) {
    return `Já existe outra sugestão pendente do n8n com esse título.`;
  }

  return null;
}
