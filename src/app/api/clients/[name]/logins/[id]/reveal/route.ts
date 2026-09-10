import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { forSquad } from "@/lib/tenant-prisma";
import { decryptSecret } from "@/lib/credential-crypto";
import { log } from "@/lib/logger";

type Params = { params: Promise<{ name: string; id: string }> };

// Descriptografa a senha do ERP sob pedido explícito — nunca embutida na listagem
// (GET /api/clients/[name]/logins). Qualquer pessoa do squad pode revelar (decisão do
// usuário: quem usa o ERP no dia a dia precisa disso), mas cada revelação fica registrada
// em PlatformLog — quem, de qual cliente/empresa, quando — sem nunca logar o valor em si.
export async function POST(_req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const db = forSquad(session.user.squadId);

  const { id } = await params;
  const login = await db.clientLogin.findFirst({
    where: { id },
    select: { id: true, client: true, empresa: true, login: true, passwordEncrypted: true },
  });
  if (!login) return NextResponse.json({ error: "Acesso não encontrado" }, { status: 404 });
  if (!login.passwordEncrypted) return NextResponse.json({ error: "Esse acesso não tem senha cadastrada" }, { status: 404 });

  let password: string;
  try {
    password = decryptSecret(login.passwordEncrypted);
  } catch (err) {
    await log("credential-reveal", "Erro ao descriptografar senha de ERP", { level: "error", detail: String(err) });
    return NextResponse.json({ error: "Não consegui descriptografar essa senha — verifique a configuração da plataforma." }, { status: 500 });
  }

  await log("credential-reveal", `Senha revelada — ${login.client} (${login.empresa || "sem razão social"})`, {
    detail: `por ${session.user.name ?? session.user.id}`,
  });

  return NextResponse.json({ login: login.login, password });
}
