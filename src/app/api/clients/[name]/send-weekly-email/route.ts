import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { forSquad } from "@/lib/tenant-prisma";
import { sendWeeklyClientEmail } from "@/lib/gmail-draft";
import { parseEmailList } from "@/lib/utils";

type Params = { params: Promise<{ name: string }> };

// Envia DE VERDADE (não é rascunho) o e-mail de pendências montado na aba "E-mail" da
// Revisão Semanal — pelo Gmail de quem está logado. Ver sendWeeklyClientEmail. Destinatário
// e cópia são resolvidos aqui, no servidor (não confia no que a UI mandou): o(s) e-mail(s)
// do cliente vêm do cadastro (ClientNote.email, pode ter mais de um) e o squad inteiro
// (menos quem está enviando) sempre entra em cópia.
export async function POST(req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const db = forSquad(session.user.squadId);

  const { name } = await params;
  const client = decodeURIComponent(name);

  const note = await db.clientNote.findUnique({ where: { squadId_client: { squadId: session.user.squadId, client } } });
  const clientEmails = parseEmailList(note?.email);
  if (clientEmails.length === 0) {
    return NextResponse.json({ error: "Esse cliente ainda não tem e-mail cadastrado (aba Notas)." }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  if (!body.subject || !body.bodyText) {
    return NextResponse.json({ error: "Assunto e corpo são obrigatórios" }, { status: 400 });
  }

  const squadUsers = await db.user.findMany({ where: { id: { not: session.user.id } }, select: { email: true } });
  const ccEmails = squadUsers.map((u) => u.email).filter(Boolean);

  const result = await sendWeeklyClientEmail(session.user.id, {
    clientEmails,
    ccEmails,
    subject: body.subject,
    bodyText: body.bodyText,
  });

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 422 });
  return NextResponse.json({ ok: true });
}
