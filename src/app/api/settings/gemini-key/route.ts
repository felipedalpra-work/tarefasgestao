import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { encryptSecret } from "@/lib/credential-crypto";
import { geminiKeySettingKey } from "@/lib/ai-provider";
import { testGeminiKey } from "@/lib/gemini";

// Self-service, por usuário — sem gate de admin, mesma régua de
// /api/settings/google-status: cada um mexe só na própria linha (chave
// construída com o próprio session.user.id, não dá pra apontar pra outro
// usuário). Nunca devolve a chave de volta, só se está conectada ou não.

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const row = await prisma.setting.findUnique({
    where: { squadId_key: { squadId: session.user.squadId, key: geminiKeySettingKey(session.user.id) } },
  });
  return NextResponse.json({ connected: !!row });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const apiKey = typeof body.apiKey === "string" ? body.apiKey.trim() : "";
  if (!apiKey) return NextResponse.json({ error: "Chave vazia" }, { status: 400 });

  // valida ANTES de gravar — prefere um erro claro agora a descobrir só horas
  // depois, quando um Meet Recap não processar
  const test = await testGeminiKey(apiKey);
  if (!test.ok) {
    return NextResponse.json({ error: `Chave inválida ou Gemini recusou a chamada: ${test.error}` }, { status: 400 });
  }

  await prisma.setting.upsert({
    where: { squadId_key: { squadId: session.user.squadId, key: geminiKeySettingKey(session.user.id) } },
    create: { squadId: session.user.squadId, key: geminiKeySettingKey(session.user.id), value: encryptSecret(apiKey) },
    update: { value: encryptSecret(apiKey) },
  });

  return NextResponse.json({ connected: true });
}

export async function DELETE() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await prisma.setting.deleteMany({
    where: { squadId: session.user.squadId, key: geminiKeySettingKey(session.user.id) },
  });
  return NextResponse.json({ connected: false });
}
