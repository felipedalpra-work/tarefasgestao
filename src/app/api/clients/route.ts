import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { auth } from "@/lib/auth";
import { forSquad } from "@/lib/tenant-prisma";
import { removeIgnoredClient } from "@/lib/settings";
import { knownClientNames } from "@/lib/client-resolve";

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const db = forSquad(session.user.squadId);

  const names = await knownClientNames(db, session.user.squadId);
  return NextResponse.json([...names].sort((a, b) => a.localeCompare(b)));
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
