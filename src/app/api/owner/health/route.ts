import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isOwner } from "@/lib/authz";
import { getPlatformHealth } from "@/lib/platform-health";

// Mesma régua de /api/owner/metrics: só isOwner, só sinal operacional
// (conexão, timestamp, status), nunca dado de negócio de um squad.
export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isOwner(session)) return NextResponse.json({ error: "Só owner da plataforma pode ver isso" }, { status: 403 });

  const health = await getPlatformHealth();
  return NextResponse.json(health);
}
