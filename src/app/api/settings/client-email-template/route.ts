import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isAdmin } from "@/lib/authz";
import { getClientEmailTemplate, setClientEmailTemplate } from "@/lib/settings";
import { DEFAULT_CLIENT_EMAIL_TEMPLATE } from "@/lib/email";

// Modelo do e-mail de pendências pro cliente, usado pela aba "E-mail" da Revisão Semanal —
// qualquer membro do squad lê, só admin edita (mesma régua do critério de Temperatura).
export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const template = await getClientEmailTemplate(session.user.squadId);
  return NextResponse.json({ template: template ?? DEFAULT_CLIENT_EMAIL_TEMPLATE });
}

export async function PUT(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdmin(session)) return NextResponse.json({ error: "Só admin do squad pode mexer nisso" }, { status: 403 });

  const body = await req.json();
  if (typeof body.template !== "string" || !body.template.trim()) {
    return NextResponse.json({ error: "Modelo não pode ficar vazio" }, { status: 400 });
  }
  await setClientEmailTemplate(session.user.squadId, body.template);

  return NextResponse.json({ template: body.template });
}
