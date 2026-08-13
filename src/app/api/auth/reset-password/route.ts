import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

const INVALID_LINK = { error: "Link inválido ou expirado. Solicite uma nova redefinição." };

export async function POST(req: NextRequest) {
  const { token, password } = await req.json();

  if (!token || typeof token !== "string") {
    return NextResponse.json({ error: "Token obrigatório" }, { status: 400 });
  }
  if (!password || typeof password !== "string" || password.length < 8) {
    return NextResponse.json({ error: "A senha precisa ter pelo menos 8 caracteres" }, { status: 400 });
  }

  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  const hashedPassword = await bcrypt.hash(password, 10);

  // Convite de membro novo (model Invite) — checado primeiro, já que usa o
  // mesmo formato de link/token que o "esqueci minha senha" abaixo.
  const invite = await prisma.invite.findUnique({ where: { tokenHash } });
  if (invite) {
    if (invite.acceptedAt || invite.expiresAt < new Date()) return NextResponse.json(INVALID_LINK, { status: 400 });

    const invitedUser = await prisma.user.findUnique({ where: { email: invite.email } });
    if (!invitedUser) return NextResponse.json(INVALID_LINK, { status: 400 });

    await prisma.$transaction([
      prisma.user.update({ where: { id: invitedUser.id }, data: { password: hashedPassword } }),
      prisma.invite.update({ where: { id: invite.id }, data: { acceptedAt: new Date() } }),
    ]);

    return NextResponse.json({ ok: true });
  }

  // Esqueci minha senha (fluxo original, sem mudança)
  const resetToken = await prisma.passwordResetToken.findUnique({ where: { tokenHash } });
  if (!resetToken || resetToken.usedAt || resetToken.expiresAt < new Date()) {
    return NextResponse.json(INVALID_LINK, { status: 400 });
  }

  await prisma.$transaction([
    prisma.user.update({ where: { id: resetToken.userId }, data: { password: hashedPassword } }),
    prisma.passwordResetToken.update({ where: { id: resetToken.id }, data: { usedAt: new Date() } }),
  ]);

  return NextResponse.json({ ok: true });
}
