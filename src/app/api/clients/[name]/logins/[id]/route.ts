import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { auth } from "@/lib/auth";
import { forSquad } from "@/lib/tenant-prisma";
import { encryptSecret } from "@/lib/credential-crypto";
import { isValidBase32Secret } from "@/lib/totp";

type Params = { params: Promise<{ name: string; id: string }> };

function toPublicShape(login: { id: string; empresa: string; erp: string | null; accessMode: string | null; login: string | null; passwordEncrypted: string | null; otpSecretEncrypted: string | null }) {
  return {
    id: login.id,
    empresa: login.empresa,
    erp: login.erp,
    accessMode: login.accessMode,
    login: login.login,
    hasPassword: !!login.passwordEncrypted,
    hasOtp: !!login.otpSecretEncrypted,
  };
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await auth();
  if (session === null) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const db = forSquad(session.user.squadId);

  const { id } = await params;
  const body = await req.json().catch(() => ({}));

  if (body.otpSecret && !isValidBase32Secret(body.otpSecret)) {
    return NextResponse.json({ error: "Segredo OTP inválido — cole o código Base32 (letras e números) que o ERP mostrou ao ativar o 2FA." }, { status: 400 });
  }

  // clientLogin.update sozinho não filtra por squad — where não aceita squadId direto
  // num update por id, então confirma antes que a linha é do squad de quem está pedindo
  const existing = await db.clientLogin.findFirst({ where: { id }, select: { id: true } });
  if (!existing) return NextResponse.json({ error: "Acesso não encontrado" }, { status: 404 });

  const login = await db.clientLogin.update({
    where: { id },
    data: {
      ...(body.empresa !== undefined && { empresa: body.empresa }),
      ...(body.erp !== undefined && { erp: body.erp || null }),
      ...(body.accessMode !== undefined && { accessMode: body.accessMode || null }),
      ...(body.login !== undefined && { login: body.login || null }),
      // string vazia REMOVE a senha/OTP guardado (ver botão "remover" na tela) — só
      // recifra quando vier um valor de verdade pra trocar
      ...(body.password !== undefined && { passwordEncrypted: body.password ? encryptSecret(body.password) : null }),
      ...(body.otpSecret !== undefined && { otpSecretEncrypted: body.otpSecret ? encryptSecret(body.otpSecret) : null }),
    },
  });

  revalidateTag("clients", "max");
  return NextResponse.json(toPublicShape(login));
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const db = forSquad(session.user.squadId);

  const { id } = await params;
  const existing = await db.clientLogin.findFirst({ where: { id }, select: { id: true } });
  if (!existing) return NextResponse.json({ error: "Acesso não encontrado" }, { status: 404 });

  await db.clientLogin.delete({ where: { id } });

  revalidateTag("clients", "max");
  return NextResponse.json({ ok: true });
}
