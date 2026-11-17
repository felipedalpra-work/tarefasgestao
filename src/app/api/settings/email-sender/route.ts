import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isAdmin } from "@/lib/authz";
import { getSystemEmailSenderUserId, setSystemEmailSenderUserId } from "@/lib/settings";

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  return NextResponse.json({ senderUserId: await getSystemEmailSenderUserId(session.user.squadId) });
}

export async function PUT(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdmin(session)) return NextResponse.json({ error: "Só admin do squad pode mexer nisso" }, { status: 403 });

  const { senderUserId } = await req.json();
  if (senderUserId !== null && typeof senderUserId !== "string") {
    return NextResponse.json({ error: "senderUserId precisa ser string ou null" }, { status: 400 });
  }

  await setSystemEmailSenderUserId(session.user.squadId, senderUserId);
  return NextResponse.json({ senderUserId: await getSystemEmailSenderUserId(session.user.squadId) });
}
