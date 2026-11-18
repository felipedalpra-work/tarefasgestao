import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isAdmin } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { sendTestEmail } from "@/lib/email";

export async function POST() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdmin(session)) return NextResponse.json({ error: "Só admin do squad pode mexer nisso" }, { status: 403 });

  const users = await prisma.user.findMany({ where: { squadId: session.user.squadId }, select: { email: true } });
  const to = users.map((u) => u.email).filter(Boolean);
  if (to.length === 0) return NextResponse.json({ error: "Nenhum e-mail pra mandar" }, { status: 400 });

  try {
    await sendTestEmail({ squadId: session.user.squadId, to, requestedByName: session.user.name || "alguém do squad" });
    return NextResponse.json({ ok: true, to });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
