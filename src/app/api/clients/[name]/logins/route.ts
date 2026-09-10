import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { auth } from "@/lib/auth";
import { forSquad } from "@/lib/tenant-prisma";
import { encryptSecret } from "@/lib/credential-crypto";
import { isValidBase32Secret } from "@/lib/totp";

type Params = { params: Promise<{ name: string }> };

// Acessos ao ERP/Oxy do cliente (aba "Oxy") — lista, não campo único, pra atender
// cliente com mais de uma empresa/CNPJ.
//
// `passwordEncrypted`/`otpSecretEncrypted` NUNCA saem daqui em texto puro — nem
// descriptografados. A lista só informa SE existe (`hasPassword`/`hasOtp`); o valor de
// verdade só sai por um pedido explícito (POST .../reveal ou GET .../otp), que fica
// registrado em log. Isso limita a exposição de segredo a "alguém pediu agora", em vez
// de estar disponível toda vez que a aba Oxy é aberta.
function toPublicShape(login: { id: string; client: string; empresa: string; erp: string | null; accessMode: string | null; login: string | null; passwordEncrypted: string | null; otpSecretEncrypted: string | null; createdAt: Date; updatedAt: Date }) {
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

export async function GET(_req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const db = forSquad(session.user.squadId);

  const { name } = await params;
  const client = decodeURIComponent(name);
  const logins = await db.clientLogin.findMany({
    where: { client },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json(logins.map(toPublicShape));
}

export async function POST(req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const db = forSquad(session.user.squadId);

  const { name } = await params;
  const client = decodeURIComponent(name);
  const body = await req.json().catch(() => ({}));

  if (body.otpSecret && !isValidBase32Secret(body.otpSecret)) {
    return NextResponse.json({ error: "Segredo OTP inválido — cole o código Base32 (letras e números) que o ERP mostrou ao ativar o 2FA." }, { status: 400 });
  }

  const login = await db.clientLogin.create({
    data: {
      squadId: session.user.squadId,
      client,
      empresa: body.empresa || "",
      erp: body.erp || null,
      accessMode: body.accessMode || null,
      login: body.login || null,
      passwordEncrypted: body.password ? encryptSecret(body.password) : null,
      otpSecretEncrypted: body.otpSecret ? encryptSecret(body.otpSecret) : null,
    },
  });

  revalidateTag("clients", "max");
  return NextResponse.json(toPublicShape(login), { status: 201 });
}
