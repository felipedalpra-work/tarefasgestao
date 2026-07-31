import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getNotificationPrefs, setNotificationPref, NOTIFICATION_TYPES, type NotificationType } from "@/lib/settings";

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  return NextResponse.json(await getNotificationPrefs());
}

// Liga/desliga um tipo de notificação do Slack por vez — { type, enabled }
export async function PUT(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { type, enabled } = await req.json();
  if (!NOTIFICATION_TYPES.includes(type)) {
    return NextResponse.json({ error: "type inválido" }, { status: 400 });
  }
  if (typeof enabled !== "boolean") {
    return NextResponse.json({ error: "enabled precisa ser boolean" }, { status: 400 });
  }

  const prefs = await setNotificationPref(type as NotificationType, enabled);
  return NextResponse.json(prefs);
}
