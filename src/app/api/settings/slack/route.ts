import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sendSlackDM } from "@/lib/slack";

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rows = await prisma.setting.findMany({
    where: { key: { startsWith: "slack_" } },
  });

  const map: Record<string, string> = {};
  rows.forEach((r) => {
    // não expõe o token inteiro — mascara
    if (r.key === "slack_bot_token") {
      map[r.key] = r.value ? `xoxb-...${r.value.slice(-6)}` : "";
    } else {
      map[r.key] = r.value;
    }
  });

  return NextResponse.json({ settings: map, configured: !!map["slack_bot_token"] });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();

  // body: { slack_bot_token?: string, slack_user_<dbId>?: string, ... }
  const upserts = Object.entries(body as Record<string, string>)
    .filter(([k]) => k.startsWith("slack_"))
    .filter(([, v]) => typeof v === "string")
    .map(([key, value]) =>
      prisma.setting.upsert({
        where: { key },
        create: { key, value },
        update: { value },
      })
    );

  await Promise.all(upserts);
  return NextResponse.json({ ok: true });
}

// testa se o bot consegue mandar mensagem para um usuário
export async function PUT(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { botToken: bodyToken, slackUserId } = await req.json();
  if (!slackUserId) {
    return NextResponse.json({ error: "slackUserId obrigatório" }, { status: 400 });
  }

  // fall back to stored token if none supplied
  let botToken = bodyToken;
  if (!botToken) {
    const stored = await prisma.setting.findUnique({ where: { key: "slack_bot_token" } });
    botToken = stored?.value;
  }

  if (!botToken) {
    return NextResponse.json({ error: "Bot token não configurado. Salve as configurações primeiro." }, { status: 400 });
  }

  const ok = await sendSlackDM(
    slackUserId,
    botToken,
    "✅ O2 Squad conectado com sucesso! Você vai receber notificações de tarefas aqui."
  );

  return NextResponse.json({ ok, error: ok ? null : "Falha ao enviar. Verifique o token e o Slack User ID." });
}
