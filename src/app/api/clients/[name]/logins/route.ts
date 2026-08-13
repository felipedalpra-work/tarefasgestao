import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { auth } from "@/lib/auth";
import { forSquad } from "@/lib/tenant-prisma";

type Params = { params: Promise<{ name: string }> };

// Acessos ao ERP/Oxy do cliente (aba "Oxy") — lista, não campo único, pra atender
// cliente com mais de uma empresa/CNPJ.
export async function GET(_req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const db = forSquad(session.user.squadId);

  const { name } = await params;
  const client = decodeURIComponent(name);
  const logins = await db.clientLogin.findMany({
    where: { client },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json(logins);
}

export async function POST(req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const db = forSquad(session.user.squadId);

  const { name } = await params;
  const client = decodeURIComponent(name);
  const body = await req.json().catch(() => ({}));

  const login = await db.clientLogin.create({
    data: {
      squadId: session.user.squadId,
      client,
      empresa: body.empresa || "",
      erp: body.erp || null,
      accessMode: body.accessMode || null,
    },
  });

  revalidateTag("clients", "max");
  return NextResponse.json(login, { status: 201 });
}
