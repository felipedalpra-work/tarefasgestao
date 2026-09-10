import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { forSquad } from "@/lib/tenant-prisma";
import { decryptSecret } from "@/lib/credential-crypto";
import { currentTotp } from "@/lib/totp";
import { log } from "@/lib/logger";

type Params = { params: Promise<{ name: string; id: string }> };

// Calcula o código TOTP atual no SERVIDOR e devolve só o código de 6 dígitos + quantos
// segundos faltam até trocar — o segredo Base32 em si nunca sai pro navegador (nem
// descriptografado nem cifrado). A tela reusa o código até `secondsRemaining` chegar a
// zero, e só então busca de novo — não precisa (nem deve) repetir essa chamada a cada
// segundo só pra atualizar um contador visual.
export async function GET(_req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const db = forSquad(session.user.squadId);

  const { id } = await params;
  const login = await db.clientLogin.findFirst({
    where: { id },
    select: { id: true, client: true, empresa: true, otpSecretEncrypted: true },
  });
  if (!login) return NextResponse.json({ error: "Acesso não encontrado" }, { status: 404 });
  if (!login.otpSecretEncrypted) return NextResponse.json({ error: "Esse acesso não tem OTP configurado" }, { status: 404 });

  let secret: string;
  try {
    secret = decryptSecret(login.otpSecretEncrypted);
  } catch (err) {
    await log("credential-reveal", "Erro ao descriptografar segredo OTP", { level: "error", detail: String(err) });
    return NextResponse.json({ error: "Não consegui gerar o código — verifique a configuração da plataforma." }, { status: 500 });
  }

  const { code, secondsRemaining } = currentTotp(secret);

  await log("credential-reveal", `Código OTP gerado — ${login.client} (${login.empresa || "sem razão social"})`, {
    detail: `por ${session.user.name ?? session.user.id}`,
  });

  return NextResponse.json({ code, secondsRemaining });
}
