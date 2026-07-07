import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ name: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { name } = await params;
  const client = decodeURIComponent(name);
  const note = await prisma.clientNote.findUnique({ where: { client } });
  return NextResponse.json(note ?? { client, notes: null, contacts: null });
}

export async function PUT(req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { name } = await params;
  const client = decodeURIComponent(name);
  const body = await req.json();

  const note = await prisma.clientNote.upsert({
    where: { client },
    update: { notes: body.notes ?? null, contacts: body.contacts ?? null },
    create: { client, notes: body.notes ?? null, contacts: body.contacts ?? null },
  });

  return NextResponse.json(note);
}
