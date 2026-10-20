import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { encryptSecret } from "@/lib/credential-crypto";
import { geminiKeySettingKey, geminiPreferenceSettingKey } from "@/lib/ai-provider";
import { testGeminiKey } from "@/lib/gemini";

// Self-service, por usuário — sem gate de admin, mesma régua de
// /api/settings/google-status: cada um mexe só na própria linha (chave
// construída com o próprio session.user.id, não dá pra apontar pra outro
// usuário). Nunca devolve a chave de volta, só se está conectada ou não.

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [row, prefRow] = await Promise.all([
    prisma.setting.findUnique({ where: { squadId_key: { squadId: session.user.squadId, key: geminiKeySettingKey(session.user.id) } } }),
    prisma.setting.findUnique({ where: { squadId_key: { squadId: session.user.squadId, key: geminiPreferenceSettingKey(session.user.id) } } }),
  ]);
  return NextResponse.json({ connected: !!row, provider: prefRow?.value === "groq" ? "groq" : "gemini" });
}

// Troca a preferência (Groq ↔ Gemini) sem desconectar a chave — ex: pra
// comparar qual dá resultado melhor, ou se o Gemini der problema
// temporariamente, voltar pro Groq sem perder a chave já salva.
export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const provider = body.provider === "groq" ? "groq" : "gemini";

  await prisma.setting.upsert({
    where: { squadId_key: { squadId: session.user.squadId, key: geminiPreferenceSettingKey(session.user.id) } },
    create: { squadId: session.user.squadId, key: geminiPreferenceSettingKey(session.user.id), value: provider },
    update: { value: provider },
  });
  return NextResponse.json({ provider });
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

  // separado do teste de conexão de propósito: se isso falhar (ex:
  // CREDENTIALS_ENCRYPTION_KEY ausente no ambiente), o erro precisa dizer
  // claramente que a chave É válida e o problema é ao salvar — não misturar
  // com "chave inválida" acima, que é um problema completamente diferente
  try {
    const encrypted = encryptSecret(apiKey);
    await prisma.setting.upsert({
      where: { squadId_key: { squadId: session.user.squadId, key: geminiKeySettingKey(session.user.id) } },
      create: { squadId: session.user.squadId, key: geminiKeySettingKey(session.user.id), value: encrypted },
      update: { value: encrypted },
    });
  } catch (err) {
    return NextResponse.json(
      { error: `Chave do Gemini é válida, mas falhou ao salvar no servidor: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 }
    );
  }

  return NextResponse.json({ connected: true });
}

export async function DELETE() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await prisma.setting.deleteMany({
    where: { squadId: session.user.squadId, key: { in: [geminiKeySettingKey(session.user.id), geminiPreferenceSettingKey(session.user.id)] } },
  });
  return NextResponse.json({ connected: false });
}
