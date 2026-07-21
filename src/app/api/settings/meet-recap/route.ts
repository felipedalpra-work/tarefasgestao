import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isMeetRecapSuggestionsEnabled, setMeetRecapSuggestionsEnabled } from "@/lib/settings";

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  return NextResponse.json({ enabled: await isMeetRecapSuggestionsEnabled() });
}

export async function PUT(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { enabled } = await req.json();
  if (typeof enabled !== "boolean") {
    return NextResponse.json({ error: "enabled precisa ser boolean" }, { status: 400 });
  }

  await setMeetRecapSuggestionsEnabled(enabled);
  return NextResponse.json({ enabled });
}
