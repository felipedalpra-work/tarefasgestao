import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { sendPasswordResetEmail } from "@/lib/email";
import { log } from "@/lib/logger";

const TOKEN_TTL_MS = 60 * 60 * 1000; // 1h

export async function POST(req: NextRequest) {
  const { email } = await req.json();

  if (!email || typeof email !== "string") {
    return NextResponse.json({ error: "Email obrigatório" }, { status: 400 });
  }

  // resposta genérica sempre — não revela se o email existe na base
  const genericResponse = NextResponse.json({
    ok: true,
    message: "Se este email estiver cadastrado, você vai receber um link para redefinir a senha.",
  });

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return genericResponse;

  const rawToken = crypto.randomBytes(32).toString("hex");
  const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");

  await prisma.passwordResetToken.deleteMany({ where: { userId: user.id, usedAt: null } });
  await prisma.passwordResetToken.create({
    data: {
      tokenHash,
      userId: user.id,
      expiresAt: new Date(Date.now() + TOKEN_TTL_MS),
    },
  });

  const resetUrl = `${process.env.NEXTAUTH_URL}/reset-password?token=${rawToken}`;

  try {
    await sendPasswordResetEmail({ to: user.email, name: user.name, resetUrl });
  } catch (e) {
    await log("auth", "Falha ao enviar email de redefinição de senha", {
      level: "error",
      detail: e instanceof Error ? e.message : String(e),
    });
  }

  return genericResponse;
}
