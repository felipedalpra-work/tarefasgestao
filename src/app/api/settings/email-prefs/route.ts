import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getEmailPrefs, setEmailPref, EMAIL_TYPES, type EmailType } from "@/lib/settings";

// Preferência pessoal (não é por squad, é por usuário) — cada um só vê/mexe na própria.
export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  return NextResponse.json(await getEmailPrefs(session.user.id));
}

export async function PUT(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { type, enabled } = await req.json();
  if (!EMAIL_TYPES.includes(type)) {
    return NextResponse.json({ error: "type inválido" }, { status: 400 });
  }
  if (typeof enabled !== "boolean") {
    return NextResponse.json({ error: "enabled precisa ser boolean" }, { status: 400 });
  }

  const prefs = await setEmailPref(session.user.id, type as EmailType, enabled);
  return NextResponse.json(prefs);
}
