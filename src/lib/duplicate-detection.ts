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

// upload manual de transcrição não tem gmailId pra deduplicar (diferente do Gmail, que já
// nunca busca de novo um e-mail já sincronizado) — então antes de processar, compara com
// recaps recentes (de qualquer origem) por duas vias: título muito parecido enviado há
// poucos dias (pega reenvio por engano do mesmo arquivo) e conteúdo muito parecido dentro
// de um mês (pega a mesma transcrição enviada com um título diferente). Cliente ainda não
// existe nesse ponto — só é extraído pela IA depois de já ter criado o MeetRecap.
const RECAP_TITLE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000; // ~1 semana
const RECAP_BODY_WINDOW_MS = 30 * 24 * 60 * 60 * 1000; // ~1 mês
const RECAP_BODY_SIMILARITY_THRESHOLD = 0.55;

function tokenSet(text: string): Set<string> {
  return new Set(normalize(text).split(" ").filter((w) => w.length > 2));
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const token of a) if (b.has(token)) intersection++;
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

export type SimilarRecap = { id: string; subject: string; createdAt: Date; reason: string };

export async function findSimilarRecap(subject: string, body: string): Promise<SimilarRecap | null> {
  const since = new Date(Date.now() - RECAP_BODY_WINDOW_MS);
  const candidates = await prisma.meetRecap.findMany({
    where: { createdAt: { gte: since } },
    select: { id: true, subject: true, body: true, createdAt: true },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  const normSubject = normalize(subject);
  const titleWindowStart = Date.now() - RECAP_TITLE_WINDOW_MS;
  const titleMatch = candidates.find(
    (c) => normSubject && normalize(c.subject) === normSubject && c.createdAt.getTime() >= titleWindowStart
  );
  if (titleMatch) {
    return { id: titleMatch.id, subject: titleMatch.subject, createdAt: titleMatch.createdAt, reason: "mesmo título, enviado há menos de 7 dias" };
  }

  const bodyTokens = tokenSet(body.slice(0, 3000));
  let best: SimilarRecap | null = null;
  let bestScore = 0;
  for (const c of candidates) {
    const score = jaccard(bodyTokens, tokenSet(c.body.slice(0, 3000)));
    if (score >= RECAP_BODY_SIMILARITY_THRESHOLD && score > bestScore) {
      bestScore = score;
      best = { id: c.id, subject: c.subject, createdAt: c.createdAt, reason: `conteúdo muito parecido (${Math.round(score * 100)}% de similaridade)` };
    }
  }
  return best;
}
