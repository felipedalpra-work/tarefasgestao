import type { SquadPrisma } from "./tenant-prisma";
import { getIgnoredClients, matchesIgnoredClient } from "./settings";
import { normalizeText } from "./utils";

// Mesmo espírito do matchesClient em src/lib/pipefy.ts — tolera acento/caixa e considera
// igual quando um nome é "variante curta" do outro (ex.: "Blomix" extraído de um título de
// evento do Google Calendar vs. "Blomix Serviços de Engenharia" cadastrado em ClientNote).
function namesLikelySame(a: string, b: string): boolean {
  const na = normalizeText(a);
  const nb = normalizeText(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  const shorter = na.length <= nb.length ? na : nb;
  const longer = na.length <= nb.length ? nb : na;
  return shorter.length >= 3 && longer.includes(shorter);
}

// Núcleo do match (sem ir ao banco) — recebe a lista de ClientNote já carregada, pra quem
// precisa resolver vários nomes em sequência (ex.: calendar-sync.ts, uma reunião por vez)
// sem repetir a mesma query a cada chamada.
export function findMatchingClient(notes: { client: string }[], input: string): string | null {
  const target = normalizeText(input);
  if (!target) return null;
  const exact = notes.find((c) => normalizeText(c.client) === target);
  if (exact) return exact.client;
  const partial = notes.find((c) => namesLikelySame(c.client, input));
  return partial?.client ?? null;
}

// Resolve o nome "oficial" do cliente (como está gravado no banco) a partir de texto
// livre — tolera acento/caixa diferente (Postgres `contains` sozinho não ignora acento,
// então "cafe" não bate com "Café" de outro jeito), comparando contra a carteira em
// ClientNote. Retorna null se não achar nenhum parecido.
//
// Extraído de src/lib/assistant-tools.ts porque passou a ser usado também pelas
// ferramentas de criar/editar cliente e tratativa — um só lugar evita a mesma regra de
// match divergir entre elas.
export async function resolveClientName(db: SquadPrisma, input: string): Promise<string | null> {
  if (!normalizeText(input)) return null;
  const notes = await db.clientNote.findMany({ select: { client: true } });
  return findMatchingClient(notes, input);
}

// Todo nome de cliente conhecido pelo squad — ClientNote é a fonte de verdade de quem
// está na carteira, mas eventos/recaps/tarefas podem citar um nome que ainda não tem
// ClientNote. Nome na lista de ignorados (cliente excluído) fica de fora mesmo se ainda
// sobrar registro solto apontando pra ele.
export async function knownClientNames(db: SquadPrisma, squadId: string): Promise<Set<string>> {
  const [ignored, notes, events, recaps, tasks] = await Promise.all([
    getIgnoredClients(squadId),
    db.clientNote.findMany({ select: { client: true } }),
    db.calendarEvent.findMany({ select: { client: true }, where: { client: { not: "" } }, distinct: ["client"] }),
    db.meetRecap.findMany({ select: { client: true }, where: { client: { not: null } }, distinct: ["client"] }),
    db.task.findMany({ select: { client: true }, where: { client: { not: null } }, distinct: ["client"] }),
  ]);

  const names = new Set<string>();
  // nomes de ClientNote entram primeiro, sem filtro — são a fonte de verdade da carteira
  notes.forEach((n) => {
    if (n.client && !matchesIgnoredClient(ignored, n.client)) names.add(n.client);
  });
  // candidatos soltos (Calendar/Recap/Task) só viram entrada NOVA se não forem variante de
  // um nome já conhecido — sem isso, achado real: "Blomix" (de um evento do Google Calendar)
  // virava uma segunda linha ao lado de "Blomix Serviços de Engenharia" em toda tela que usa
  // essa lista (Jornada de Onboarding, Revisão Semanal, seleção de cliente em Nova Tarefa…)
  const add = (client: string | null) => {
    if (!client || matchesIgnoredClient(ignored, client)) return;
    if ([...names].some((known) => namesLikelySame(known, client))) return;
    names.add(client);
  };
  events.forEach((e) => add(e.client));
  recaps.forEach((r) => add(r.client));
  tasks.forEach((t) => add(t.client));
  return names;
}
