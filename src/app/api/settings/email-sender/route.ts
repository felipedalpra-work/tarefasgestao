import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isAdmin } from "@/lib/authz";
import {
  getSystemEmailSenderUserId,
  setSystemEmailSenderUserId,
  getSystemEmailSenderAlias,
  setSystemEmailSenderAlias,
} from "@/lib/settings";

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [senderUserId, alias] = await Promise.all([
    getSystemEmailSenderUserId(session.user.squadId),
    getSystemEmailSenderAlias(session.user.squadId),
  ]);
  return NextResponse.json({ senderUserId, alias });
}

export async function PUT(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdmin(session)) return NextResponse.json({ error: "Só admin do squad pode mexer nisso" }, { status: 403 });

  const body = await req.json();

  if (body.senderUserId !== undefined) {
    if (body.senderUserId !== null && typeof body.senderUserId !== "string") {
      return NextResponse.json({ error: "senderUserId precisa ser string ou null" }, { status: 400 });
    }
    await setSystemEmailSenderUserId(session.user.squadId, body.senderUserId);
  }

  if (body.alias !== undefined) {
    if (body.alias !== null && typeof body.alias !== "string") {
      return NextResponse.json({ error: "alias precisa ser string ou null" }, { status: 400 });
    }
    await setSystemEmailSenderAlias(session.user.squadId, body.alias || null);
  }

  const [senderUserId, alias] = await Promise.all([
    getSystemEmailSenderUserId(session.user.squadId),
    getSystemEmailSenderAlias(session.user.squadId),
  ]);
  return NextResponse.json({ senderUserId, alias });
}
