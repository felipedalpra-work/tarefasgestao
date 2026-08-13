import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isAdmin } from "@/lib/authz";
import { getOrCreateN8nWebhookSecret, regenerateN8nWebhookSecret } from "@/lib/settings";

// Só admin vê/mexe — diferente do Meet Recap Gmail (que todo mundo pode ver), esse
// secret é uma credencial de acesso: um membro comum não tem motivo legítimo pra
// ver ou copiar ele.
export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdmin(session)) return NextResponse.json({ error: "Só admin do squad pode ver isso" }, { status: 403 });

  const secret = await getOrCreateN8nWebhookSecret(session.user.squadId);
  return NextResponse.json({ secret });
}

// Gera um secret novo, invalidando o anterior — quem já configurou o workflow n8n
// com o valor antigo precisa atualizar o header Authorization lá.
export async function POST() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdmin(session)) return NextResponse.json({ error: "Só admin do squad pode mexer nisso" }, { status: 403 });

  const secret = await regenerateN8nWebhookSecret(session.user.squadId);
  return NextResponse.json({ secret });
}
