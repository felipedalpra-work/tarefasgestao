import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getUsers } from "@/lib/queries";
import { revalidateTag } from "next/cache";

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const users = await getUsers();

  return NextResponse.json(users, {
    headers: { "Cache-Control": "private, max-age=300, stale-while-revalidate=600" },
  });
}

// Cria um novo membro da equipe. O login com Google só é liberado (src/lib/auth.ts,
// callback signIn) se o e-mail já tiver uma linha em User — é assim que se "convida"
// alguém novo, antes de qualquer tentativa de login.
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  if (!body?.email) {
    return NextResponse.json({ error: "email é obrigatório" }, { status: 400 });
  }

  let user;
  try {
    user = await prisma.user.create({
      data: {
        name: body.name || null,
        email: body.email,
        cargo: body.cargo || null,
      },
      select: { id: true, name: true, email: true, image: true, cargo: true },
    });
  } catch {
    return NextResponse.json({ error: "já existe alguém com esse e-mail" }, { status: 409 });
  }

  revalidateTag("users", "max");

  return NextResponse.json(user, { status: 201 });
}
