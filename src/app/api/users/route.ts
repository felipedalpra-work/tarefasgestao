import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isAdmin } from "@/lib/authz";
import { forSquad } from "@/lib/tenant-prisma";
import { getUsers } from "@/lib/queries";
import { revalidateTag } from "next/cache";

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const users = await getUsers(session.user.squadId);

  return NextResponse.json(users, {
    headers: { "Cache-Control": "private, max-age=300, stale-while-revalidate=600" },
  });
}

// Convida um novo membro pro squad de quem está convidando. O login com Google só é
// liberado (src/lib/auth.ts, callback signIn) se o e-mail já tiver uma linha em User —
// é assim que se "convida" alguém novo, antes de qualquer tentativa de login. Só admin
// (o CFO) pode convidar/definir o perfil de quem entra.
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdmin(session)) return NextResponse.json({ error: "Só admin do squad pode convidar gente" }, { status: 403 });
  const db = forSquad(session.user.squadId);

  const body = await req.json();
  if (!body?.email) {
    return NextResponse.json({ error: "email é obrigatório" }, { status: 400 });
  }
  const role = body.role === "admin" ? "admin" : "member";

  let user;
  try {
    user = await db.user.create({
      data: {
        squadId: session.user.squadId,
        name: body.name || null,
        email: body.email,
        cargo: body.cargo || null,
        role,
      },
      select: { id: true, name: true, email: true, image: true, cargo: true, role: true },
    });
  } catch {
    return NextResponse.json({ error: "já existe alguém com esse e-mail" }, { status: 409 });
  }

  revalidateTag("users", "max");

  return NextResponse.json(user, { status: 201 });
}
