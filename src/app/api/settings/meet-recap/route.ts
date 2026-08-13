import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isAdmin } from "@/lib/authz";
import {
  isMeetRecapSuggestionsEnabled,
  setMeetRecapSuggestionsEnabled,
  getMeetRecapGmailUserId,
  setMeetRecapGmailUserId,
} from "@/lib/settings";

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  return NextResponse.json({
    enabled: await isMeetRecapSuggestionsEnabled(session.user.squadId),
    gmailUserId: await getMeetRecapGmailUserId(session.user.squadId),
  });
}

export async function PUT(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdmin(session)) return NextResponse.json({ error: "Só admin do squad pode mexer nisso" }, { status: 403 });

  const body = await req.json();

  if (body.enabled !== undefined) {
    if (typeof body.enabled !== "boolean") {
      return NextResponse.json({ error: "enabled precisa ser boolean" }, { status: 400 });
    }
    await setMeetRecapSuggestionsEnabled(session.user.squadId, body.enabled);
  }

  if (body.gmailUserId !== undefined) {
    if (body.gmailUserId !== null && typeof body.gmailUserId !== "string") {
      return NextResponse.json({ error: "gmailUserId precisa ser string ou null" }, { status: 400 });
    }
    await setMeetRecapGmailUserId(session.user.squadId, body.gmailUserId);
  }

  return NextResponse.json({
    enabled: await isMeetRecapSuggestionsEnabled(session.user.squadId),
    gmailUserId: await getMeetRecapGmailUserId(session.user.squadId),
  });
}
