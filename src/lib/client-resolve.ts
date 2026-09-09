import type { SquadPrisma } from "./tenant-prisma";
import { getIgnoredClients, matchesIgnoredClient } from "./settings";
import { normalizeText } from "./utils";

// Resolve o nome "oficial" do cliente (como está gravado no banco) a partir de texto
// livre — tolera acento/caixa diferente (Postgres `contains` sozinho não ignora acento,
// então "cafe" não bate com "Café" de outro jeito), comparando contra a carteira em
// ClientNote. Retorna null se não achar nenhum parecido.
//
// Extraído de src/lib/assistant-tools.ts porque passou a ser usado também pelas
// ferramentas de criar/editar cliente e tratativa — um só lugar evita a mesma regra de
// match divergir entre elas.
export async function resolveClientName(db: SquadPrisma, input: string): Promise<string | null> {
  const target = normalizeText(input);
  if (!target) return null;
  const notes = await db.clientNote.findMany({ select: { client: true } });
  const exact = notes.find((c) => normalizeText(c.client) === target);
  if (exact) return exact.client;
  const partial = notes.find((c) => normalizeText(c.client).includes(target) || target.includes(normalizeText(c.client)));
  return partial?.client ?? null;
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
  const add = (client: string | null) => {
    if (client && !matchesIgnoredClient(ignored, client)) names.add(client);
  };
  notes.forEach((n) => add(n.client));
  events.forEach((e) => add(e.client));
  recaps.forEach((r) => add(r.client));
  tasks.forEach((t) => add(t.client));
  return names;
}
