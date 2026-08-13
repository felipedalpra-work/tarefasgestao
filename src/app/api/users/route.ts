import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { auth } from "@/lib/auth";
import { isAdmin } from "@/lib/authz";
import { forSquad } from "@/lib/tenant-prisma";
import { prisma } from "@/lib/prisma";
import { getUsers } from "@/lib/queries";
import { sendInviteEmail } from "@/lib/email";
import { log } from "@/lib/logger";
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
// linha em User), a pessoa também ganha um link de convite (mesmo mecanismo de
// token do "esqueci minha senha", PasswordResetToken) pra definir senha própria e
// entrar por credenciais — mandado por email e devolvido pro admin copiar/repassar
// por qualquer canal (Slack, WhatsApp etc.), caso o email não chegue. Só admin
// (o CFO) pode convidar/definir o perfil de quem entra.
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
  await prisma.passwordResetToken.create({
    data: { tokenHash, userId: user.id, expiresAt: new Date(Date.now() + INVITE_TOKEN_TTL_MS) },
  });
  const inviteUrl = `${process.env.NEXTAUTH_URL}/reset-password?token=${rawToken}`;

  let emailSent = false;
  try {
    const squad = await prisma.squad.findUnique({ where: { id: session.user.squadId }, select: { name: true } });
    await sendInviteEmail({
      to: user.email,
      name: user.name,
      squadName: squad?.name || "seu squad",
      invitedBy: session.user.name,
      inviteUrl,
    });
    emailSent = true;
  } catch (e) {
    await log("auth", "Falha ao enviar email de convite", {
      level: "error",
      detail: e instanceof Error ? e.message : String(e),
    });
  }

  revalidateTag("users", "max");

  return NextResponse.json({ ...user, inviteUrl, emailSent }, { status: 201 });
}
