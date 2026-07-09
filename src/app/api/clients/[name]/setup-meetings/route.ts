import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ name: string }> };

const CODES = ["R1", "R2", "R3", "R4"] as const;

export async function GET(_req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { name } = await params;
  const client = decodeURIComponent(name);
  const existing = await prisma.setupMeeting.findMany({ where: { client } });
  const byCode = new Map(existing.map((m) => [m.code, m]));

  const meetings = CODES.map(
    (code) =>
      byCode.get(code) ?? {
        id: null,
        client,
        code,
        scheduledAt: null,
        completedAt: null,
        participants: null,
        recordingUrl: null,
        transcriptUrl: null,
        nextSteps: null,
      }
  );

  return NextResponse.json(meetings);
}

const FREE_TEXT_FIELDS = ["participants", "recordingUrl", "transcriptUrl", "nextSteps"] as const;
const DATE_FIELDS = ["scheduledAt", "completedAt"] as const;

export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { name } = await params;
  const client = decodeURIComponent(name);
  const body = await req.json();

  if (!CODES.includes(body.code)) return NextResponse.json({ error: "code inválido" }, { status: 400 });

  const data: Record<string, string | Date | null> = {};
  for (const field of FREE_TEXT_FIELDS) {
    if (body[field] !== undefined) data[field] = body[field] || null;
  }
  for (const field of DATE_FIELDS) {
    if (body[field] !== undefined) data[field] = body[field] ? new Date(body[field]) : null;
  }

  const meeting = await prisma.setupMeeting.upsert({
    where: { client_code: { client, code: body.code } },
    update: data,
    create: { client, code: body.code, ...data },
  });

  revalidateTag("clients", "max");

  return NextResponse.json(meeting);
}
