import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { auth } from "@/lib/auth";
import { isAdmin } from "@/lib/authz";
import { forSquad } from "@/lib/tenant-prisma";
import { prisma } from "@/lib/prisma";
import { getUsers } from "@/lib/queries";
import { getBaseUrl } from "@/lib/base-url";
import { revalidateTag } from "next/cache";

const INVITE_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 dias — convite de time não é urgente como reset de senha

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const users = await getUsers(session.user.squadId);

  return NextResponse.json(users, {
    headers: { "Cache-Control": "private, max-age=300, stale-while-revalidate=600" },
  });
}

// Convida um novo membro pro squad de quem está convidando. Além do login com
// Google (src/lib/auth.ts, callback signIn — liberado porque o e-mail já tem uma
// linha em User), a pessoa também ganha um link de convite (model Invite, com
// token próprio — não é mais o PasswordResetToken do "esqueci minha senha",
// pra ter histórico e sobreviver à remoção do membro, ver prisma/schema.prisma)
// pra definir senha própria e entrar por credenciais. Envio por email foi
// abandonado (não chegava de forma confiável) — o link sempre volta na resposta
// pra copiar/repassar por qualquer canal. Só admin (o CFO) pode convidar/definir
// o perfil de quem entra.
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdmin(session)) return NextResponse.json({ error: "Só admin do squad pode convidar gente" }, { status: 403 });
  const db = forSquad(session.user.squadId);

  const body = await req.json();
  if (!body?.email) {
    return NextResponse.json({ error: "email é obrigatório" }, { status: 400 });
  }
  const role = body.role === "admin" ? "admin" : "member";

  let user;
  try {
    user = await db.user.create({
      data: {
        squadId: session.user.squadId,
        name: body.name || null,
        email: body.email,
        cargo: body.cargo || null,
        role,
      },
      select: { id: true, name: true, email: true, image: true, cargo: true, role: true },
    });
  } catch {
    return NextResponse.json({ error: "já existe alguém com esse e-mail" }, { status: 409 });
  }

  const rawToken = crypto.randomBytes(32).toString("hex");
  const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
  await prisma.invite.create({
    data: {
      squadId: session.user.squadId,
      email: user.email,
      name: user.name,
      role,
      invitedByName: session.user.name,
      tokenHash,
      expiresAt: new Date(Date.now() + INVITE_TOKEN_TTL_MS),
    },
  });
  const inviteUrl = `${getBaseUrl()}/reset-password?token=${rawToken}`;

  revalidateTag("users", "max");

  return NextResponse.json({ ...user, inviteUrl }, { status: 201 });
}
