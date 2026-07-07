import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ connected: false });

  const account = await prisma.account.findFirst({
    where: { userId: session.user.id, provider: "google" },
  });

  return NextResponse.json({ connected: !!account?.access_token });
}
