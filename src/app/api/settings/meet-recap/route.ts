import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
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
    enabled: await isMeetRecapSuggestionsEnabled(),
    gmailUserId: await getMeetRecapGmailUserId(),
  });
}

export async function PUT(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();

  if (body.enabled !== undefined) {
    if (typeof body.enabled !== "boolean") {
      return NextResponse.json({ error: "enabled precisa ser boolean" }, { status: 400 });
    }
    await setMeetRecapSuggestionsEnabled(body.enabled);
  }

  if (body.gmailUserId !== undefined) {
    if (body.gmailUserId !== null && typeof body.gmailUserId !== "string") {
      return NextResponse.json({ error: "gmailUserId precisa ser string ou null" }, { status: 400 });
    }
    await setMeetRecapGmailUserId(body.gmailUserId);
  }

  return NextResponse.json({
    enabled: await isMeetRecapSuggestionsEnabled(),
    gmailUserId: await getMeetRecapGmailUserId(),
  });
}
