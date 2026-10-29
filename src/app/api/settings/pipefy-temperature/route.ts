import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isAdmin } from "@/lib/authz";
import {
  getTemperaturePrompt,
  setTemperaturePrompt,
  isTemperaturePromptDismissed,
  dismissTemperaturePrompt,
} from "@/lib/settings";

// Qualquer membro do squad lê (é informativo — não é credencial) — só admin edita, mesma
// régua do secret do n8n.
export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [prompt, dismissed] = await Promise.all([
    getTemperaturePrompt(session.user.squadId),
    isTemperaturePromptDismissed(session.user.squadId),
  ]);
  return NextResponse.json({ prompt, dismissed });
}

// `prompt` vem do popup de primeira configuração ou da tela de Configurações — ambos
// chamam essa mesma rota. `dismissed` vem só do popup ("Agora não").
export async function PUT(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdmin(session)) return NextResponse.json({ error: "Só admin do squad pode mexer nisso" }, { status: 403 });

  const body = await req.json();
  if (typeof body.prompt === "string") {
    await setTemperaturePrompt(session.user.squadId, body.prompt);
  }
  if (body.dismissed === true) {
    await dismissTemperaturePrompt(session.user.squadId);
  }

  const [prompt, dismissed] = await Promise.all([
    getTemperaturePrompt(session.user.squadId),
    isTemperaturePromptDismissed(session.user.squadId),
  ]);
  return NextResponse.json({ prompt, dismissed });
}
