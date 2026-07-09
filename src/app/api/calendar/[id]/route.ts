import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

const TEMPERATURE_VALUES = ["otimo", "bom", "atencao", "critico"];
const MEETING_TYPE_VALUES = ["semanal", "comite", "kickoff", "setup", "interno"];

// Atualiza a Temperatura (clima) e/ou o tipo de uma reunião já sincronizada
export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();

  const data: Record<string, string | null> = {};

  if (body.temperature !== undefined) {
    if (body.temperature !== null && !TEMPERATURE_VALUES.includes(body.temperature)) {
      return NextResponse.json({ error: "temperature inválida" }, { status: 400 });
    }
    data.temperature = body.temperature;
  }
  if (body.meetingType !== undefined) {
    if (body.meetingType !== null && !MEETING_TYPE_VALUES.includes(body.meetingType)) {
      return NextResponse.json({ error: "meetingType inválido" }, { status: 400 });
    }
    data.meetingType = body.meetingType;
  }

  const event = await prisma.calendarEvent.update({ where: { id }, data });

  revalidateTag("calendar", "max");

  return NextResponse.json(event);
}
