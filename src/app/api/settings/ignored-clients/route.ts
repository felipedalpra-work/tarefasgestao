import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { auth } from "@/lib/auth";
import { isAdmin } from "@/lib/authz";
import { getIgnoredClients, removeIgnoredClient } from "@/lib/settings";

// Nomes que ficam fora da carteira do squad mesmo aparecendo na agenda de alguém.
// Um nome entra aqui ao excluir o cliente (DELETE /api/clients/[name]) — esta rota só
// lista e libera de novo, não tem POST: ignorar um nome que nunca foi cliente não faz
// sentido, e ignorar um que é cliente é justamente o que a exclusão faz (com a
// confirmação e a limpeza dos dados que ela já tem).
export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  return NextResponse.json({ clients: await getIgnoredClients(session.user.squadId) });
}

export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdmin(session)) return NextResponse.json({ error: "Só admin do squad pode mexer nisso" }, { status: 403 });

  const client = req.nextUrl.searchParams.get("client")?.trim();
  if (!client) return NextResponse.json({ error: "Informe o nome do cliente" }, { status: 400 });

  const clients = await removeIgnoredClient(session.user.squadId, client);

  // liberar o nome não recria nada: as reuniões futuras voltam no próximo sync da agenda
  // (as passadas foram apagadas junto com a exclusão e não voltam), e é isso que faz o
  // nome reaparecer na carteira
  revalidateTag("clients", "max");
  revalidateTag("calendar", "max");

  return NextResponse.json({ clients });
}
