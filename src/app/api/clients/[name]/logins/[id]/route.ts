import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ name: string; id: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json().catch(() => ({}));

  const login = await prisma.clientLogin.update({
    where: { id },
    data: {
      ...(body.empresa !== undefined && { empresa: body.empresa }),
      ...(body.erp !== undefined && { erp: body.erp || null }),
      ...(body.accessMode !== undefined && { accessMode: body.accessMode || null }),
    },
  });

  revalidateTag("clients", "max");
  return NextResponse.json(login);
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  await prisma.clientLogin.delete({ where: { id } });

  revalidateTag("clients", "max");
  return NextResponse.json({ ok: true });
}
