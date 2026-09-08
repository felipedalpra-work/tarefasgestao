import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ASSISTANT_HISTORY_LIMIT } from "@/lib/assistant-tools";
import { pendingActionsFor } from "@/lib/assistant-actions";

// Histórico do assistente, por pessoa — carregado quando o painel abre, pra ele
// lembrar da conversa mesmo depois de recarregar a página.
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const messages = await prisma.assistantMessage.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
    take: ASSISTANT_HISTORY_LIMIT,
    select: { role: true, content: true },
  });

  // acao esperando confirmacao volta junto: sem isso, dar F5 no meio de uma alteracao
  // faria o botao Confirmar sumir e a pessoa teria que pedir tudo de novo
  const pending = await pendingActionsFor(session.user.id, session.user.squadId);

  return NextResponse.json({
    messages: messages.reverse(),
    pendingAction: pending[0] ?? undefined,
  });
}

// "Nova conversa" — apaga o histórico da pessoa, sem afetar o de mais ninguém do squad.
export async function DELETE() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await prisma.assistantMessage.deleteMany({ where: { userId: session.user.id } });
  // conversa nova nao herda acao pendente da anterior
  await prisma.assistantAction.updateMany({
    where: { userId: session.user.id, status: "pending" },
    data: { status: "cancelled", resolvedAt: new Date() },
  });
  return NextResponse.json({ ok: true });
}
