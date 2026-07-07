import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { checkDeadlines } from "@/lib/deadline-check";

export async function POST() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sent = await checkDeadlines();
  return NextResponse.json({ sent });
}
