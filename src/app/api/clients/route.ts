import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Lista de nomes de clientes conhecidos (carteira em ClientNote + eventos, recaps e tarefas —
// ClientNote é a fonte de verdade de quais clientes existem, ver getClientsTable em src/lib/queries.ts;
// sem ela, cliente só cadastrado na carteira, ainda sem nenhuma atividade, não aparece aqui)
export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const names = await knownClientNames();
  return NextResponse.json([...names].sort((a, b) => a.localeCompare(b)));
}

async function knownClientNames(): Promise<Set<string>> {
  const [notes, events, recaps, tasks] = await Promise.all([
    prisma.clientNote.findMany({ select: { client: true } }),
    prisma.calendarEvent.findMany({ select: { client: true }, where: { client: { not: "" } }, distinct: ["client"] }),
    prisma.meetRecap.findMany({ select: { client: true }, where: { client: { not: null } }, distinct: ["client"] }),
    prisma.task.findMany({ select: { client: true }, where: { client: { not: null } }, distinct: ["client"] }),
  ]);

  const names = new Set<string>();
  notes.forEach((n) => n.client && names.add(n.client));
  events.forEach((e) => e.client && names.add(e.client));
  recaps.forEach((r) => r.client && names.add(r.client));
  tasks.forEach((t) => t.client && names.add(t.client));
  return names;
}

// Cadastra um cliente novo (ainda sem nenhuma tarefa/reunião/recap) direto na carteira,
// pra ele já aparecer na tabela de /clientes antes da primeira atividade.
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const client = typeof body?.client === "string" ? body.client.trim() : "";
  if (!client) return NextResponse.json({ error: "Nome do cliente é obrigatório" }, { status: 400 });

  // client é só uma string espalhada em várias tabelas (não é entidade própria) — compara
  // sem diferenciar maiúsculas/minúsculas contra TODAS as fontes, não só ClientNote, senão
  // "fismatek" e "Fismatek" viram dois clientes diferentes na tabela.
  const existing = await knownClientNames();
  const lowerExisting = new Set([...existing].map((n) => n.toLowerCase()));
  if (lowerExisting.has(client.toLowerCase())) {
    return NextResponse.json({ error: "Já existe um cliente com esse nome" }, { status: 409 });
  }

  try {
    const note = await prisma.clientNote.create({ data: { client } });
    revalidateTag("clients", "max");
    return NextResponse.json(note, { status: 201 });
  } catch {
    // corrida rara: alguém criou o mesmo nome entre a checagem acima e o create
    return NextResponse.json({ error: "Já existe um cliente com esse nome" }, { status: 409 });
  }
}
