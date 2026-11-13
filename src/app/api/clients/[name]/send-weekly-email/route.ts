import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { forSquad } from "@/lib/tenant-prisma";
import { sendWeeklyClientEmail } from "@/lib/gmail-draft";

type Params = { params: Promise<{ name: string }> };

// Envia DE VERDADE (não é rascunho) o e-mail de pendências montado na aba "E-mail" da
// Revisão Semanal — pelo Gmail de quem está logado. Ver sendWeeklyClientEmail.
export async function POST(req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const db = forSquad(session.user.squadId);

  const { name } = await params;
  const client = decodeURIComponent(name);

  const note = await db.clientNote.findUnique({ where: { squadId_client: { squadId: session.user.squadId, client } } });
  if (!note?.email) {
    return NextResponse.json({ error: "Esse cliente ainda não tem e-mail cadastrado (aba Notas)." }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  if (!body.subject || !body.bodyText) {
    return NextResponse.json({ error: "Assunto e corpo são obrigatórios" }, { status: 400 });
  }

  const result = await sendWeeklyClientEmail(session.user.id, {
    clientEmail: note.email,
    subject: body.subject,
    bodyText: body.bodyText,
  });

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 422 });
  return NextResponse.json({ ok: true });
}
