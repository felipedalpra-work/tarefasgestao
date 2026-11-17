import { NextResponse } from "next/server";
import crypto from "crypto";
import { auth } from "@/lib/auth";
import { isAdmin } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { getBaseUrl } from "@/lib/base-url";

const INVITE_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

type Params = { params: Promise<{ id: string }> };

// Gera um token novo pro mesmo convite (invalida o anterior) — pra quem ainda
// não aceitou (pendente ou expirado). O link volta na resposta pra copiar/repassar
// por qualquer canal.
export async function POST(_req: Request, { params }: Params) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdmin(session)) return NextResponse.json({ error: "Só admin do squad pode reenviar convite" }, { status: 403 });

  const { id } = await params;
  const invite = await prisma.invite.findUnique({ where: { id } });
  if (!invite || invite.squadId !== session.user.squadId) {
    return NextResponse.json({ error: "Convite não encontrado" }, { status: 404 });
  }
  if (invite.acceptedAt) {
    return NextResponse.json({ error: "Esse convite já foi aceito" }, { status: 400 });
  }

  const rawToken = crypto.randomBytes(32).toString("hex");
  const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
  await prisma.invite.update({
    where: { id },
    data: { tokenHash, expiresAt: new Date(Date.now() + INVITE_TOKEN_TTL_MS) },
  });
  const inviteUrl = `${getBaseUrl()}/reset-password?token=${rawToken}`;

  return NextResponse.json({ inviteUrl });
}
