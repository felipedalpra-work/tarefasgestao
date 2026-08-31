import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { auth } from "@/lib/auth";
import { forSquad, type SquadPrisma } from "@/lib/tenant-prisma";
import { getIgnoredClients, matchesIgnoredClient, removeIgnoredClient } from "@/lib/settings";

// Lista de nomes de clientes conhecidos (carteira em ClientNote + eventos, recaps e tarefas —
// ClientNote é a fonte de verdade de quais clientes existem, ver getClientsTable em src/lib/queries.ts;
// sem ela, cliente só cadastrado na carteira, ainda sem nenhuma atividade, não aparece aqui)
export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const db = forSquad(session.user.squadId);

  const names = await knownClientNames(db, session.user.squadId);
  return NextResponse.json([...names].sort((a, b) => a.localeCompare(b)));
}

// squadId é o mesmo do `db`, mas a lista de ignorados vive numa Setting (fora do escopo
// do forSquad), então precisa vir explícito
async function knownClientNames(db: SquadPrisma, squadId: string): Promise<Set<string>> {
  const [ignored, notes, events, recaps, tasks] = await Promise.all([
    getIgnoredClients(squadId),
    db.clientNote.findMany({ select: { client: true } }),
    db.calendarEvent.findMany({ select: { client: true }, where: { client: { not: "" } }, distinct: ["client"] }),
    db.meetRecap.findMany({ select: { client: true }, where: { client: { not: null } }, distinct: ["client"] }),
    db.task.findMany({ select: { client: true }, where: { client: { not: null } }, distinct: ["client"] }),
  ]);

  const names = new Set<string>();
  const add = (client: string | null) => {
    // nome ignorado não é da carteira: fica fora mesmo se ainda sobrou registro apontando
    // pra ele (evento de agenda que o sync ainda não limpou, tarefa antiga solta...)
    if (client && !matchesIgnoredClient(ignored, client)) names.add(client);
  };
  notes.forEach((n) => add(n.client));
  events.forEach((e) => add(e.client));
  recaps.forEach((r) => add(r.client));
  tasks.forEach((t) => add(t.client));
  return names;
}

// Cadastra um cliente novo (ainda sem nenhuma tarefa/reunião/recap) direto na carteira,
// pra ele já aparecer na tabela de /clientes antes da primeira atividade.
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const db = forSquad(session.user.squadId);

  const body = await req.json().catch(() => null);
  const client = typeof body?.client === "string" ? body.client.trim() : "";
  if (!client) return NextResponse.json({ error: "Nome do cliente é obrigatório" }, { status: 400 });

  // client é só uma string espalhada em várias tabelas (não é entidade própria) — compara
  // sem diferenciar maiúsculas/minúsculas contra TODAS as fontes, não só ClientNote, senão
  // "fismatek" e "Fismatek" viram dois clientes diferentes na tabela.
  const existing = await knownClientNames(db, session.user.squadId);
  const lowerExisting = new Set([...existing].map((n) => n.toLowerCase()));
  if (lowerExisting.has(client.toLowerCase())) {
    return NextResponse.json({ error: "Já existe um cliente com esse nome" }, { status: 409 });
  }

  try {
    const note = await db.clientNote.create({ data: { squadId: session.user.squadId, client } });
    // cadastrar o nome de novo é o "desfazer" da exclusão, que deixou ele na lista de
    // ignorados — sem tirar de lá, o cliente entraria na carteira já invisível na listagem
    // e as reuniões dele continuariam sendo apagadas a cada sync da agenda
    await removeIgnoredClient(session.user.squadId, client);
    revalidateTag("clients", "max");
    revalidateTag("calendar", "max");
    return NextResponse.json(note, { status: 201 });
  } catch {
    // corrida rara: alguém criou o mesmo nome entre a checagem acima e o create
    return NextResponse.json({ error: "Já existe um cliente com esse nome" }, { status: 409 });
  }
}
