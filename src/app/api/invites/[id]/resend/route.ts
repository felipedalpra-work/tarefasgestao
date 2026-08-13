import { NextResponse } from "next/server";
import crypto from "crypto";
import { auth } from "@/lib/auth";
import { isAdmin } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { getSlackConfig, sendSlackDM } from "@/lib/slack";
import { getBaseUrl } from "@/lib/base-url";

const INVITE_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

type Params = { params: Promise<{ id: string }> };

// Gera um token novo pro mesmo convite (invalida o anterior) — pra quem ainda
// não aceitou (pendente ou expirado). Reenvia por Slack automaticamente se já
// existir um Slack User ID salvo pra essa pessoa.
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

  let slackSent = false;
  const invitedUser = await prisma.user.findUnique({ where: { email: invite.email } });
  if (invitedUser) {
    const config = await getSlackConfig(session.user.squadId);
    const slackUserId = config?.userMap[invitedUser.id];
    if (config && slackUserId) {
      const squad = await prisma.squad.findUnique({ where: { id: session.user.squadId }, select: { name: true } });
      const lines = [
        `👋 *Convite reenviado — squad ${squad?.name || "O2"}*`,
        `<${inviteUrl}|Criar senha e entrar →>`,
        "",
        `Esse link expira em 7 dias. Também dá pra entrar direto com o Google usando o e-mail ${invite.email}.`,
      ].join("\n");
      slackSent = await sendSlackDM(slackUserId, config.botToken, lines);
    }
  }

  return NextResponse.json({ inviteUrl, slackSent });
}
