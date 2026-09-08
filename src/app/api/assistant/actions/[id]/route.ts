import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { revalidateTag } from "next/cache";
import { executeAction, cancelAction } from "@/lib/assistant-actions";

type Params = { params: Promise<{ id: string }> };

// Confirma (ou cancela) uma alteração que o assistente deixou pendente. É AQUI que a
// mudança acontece de fato — a ferramenta do chat só registra a intenção.
//
// A ação carrega o userId de quem pediu e executeAction confere isso contra a sessão:
// ninguém confirma ação preparada pra outra pessoa, nem de outro squad.
export async function POST(req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json().catch(() => ({}));

  if (body?.confirm === false) {
    const ok = await cancelAction(id, { squadId: session.user.squadId, userId: session.user.id });
    if (!ok) return NextResponse.json({ error: "Ação não encontrada ou já resolvida." }, { status: 404 });
    // fica registrado na conversa pra pessoa ver depois o que ela recusou
    await prisma.assistantMessage.create({
      data: { userId: session.user.id, role: "assistant", content: "Ok, cancelei — não mexi em nada." },
    });
    return NextResponse.json({ cancelled: true, reply: "Ok, cancelei — não mexi em nada." });
  }

  const result = await executeAction(id, {
    squadId: session.user.squadId,
    userId: session.user.id,
    userName: session.user.name ?? null,
  });

  if (!result.ok) return NextResponse.json({ error: result.erro }, { status: 400 });

  revalidateTag("tasks", "max");
  const reply = `Feito: ${result.resumo}`;
  await prisma.assistantMessage.create({ data: { userId: session.user.id, role: "assistant", content: reply } });
  return NextResponse.json({ confirmed: true, reply });
}
