import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isAdmin } from "@/lib/authz";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdmin(session)) return NextResponse.json({ error: "Só admin do squad pode ver os convites" }, { status: 403 });

  const invites = await prisma.invite.findMany({
    where: { squadId: session.user.squadId },
    orderBy: { createdAt: "desc" },
    select: { id: true, email: true, name: true, role: true, invitedByName: true, expiresAt: true, acceptedAt: true, createdAt: true },
  });

  return NextResponse.json(invites);
}
