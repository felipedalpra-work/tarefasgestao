import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ASSISTANT_HISTORY_LIMIT } from "@/lib/assistant-tools";

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

  return NextResponse.json({ messages: messages.reverse() });
}

// "Nova conversa" — apaga o histórico da pessoa, sem afetar o de mais ninguém do squad.
export async function DELETE() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await prisma.assistantMessage.deleteMany({ where: { userId: session.user.id } });
  return NextResponse.json({ ok: true });
}
