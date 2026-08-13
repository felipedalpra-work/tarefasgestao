import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isAdmin } from "@/lib/authz";
import { getBillingDraftOwnerUserId, setBillingDraftOwnerUserId } from "@/lib/settings";

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  return NextResponse.json({ ownerUserId: await getBillingDraftOwnerUserId(session.user.squadId) });
}

export async function PUT(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdmin(session)) return NextResponse.json({ error: "Só admin do squad pode mexer nisso" }, { status: 403 });

  const { ownerUserId } = await req.json();
  if (ownerUserId !== null && typeof ownerUserId !== "string") {
    return NextResponse.json({ error: "ownerUserId precisa ser string ou null" }, { status: 400 });
  }

  await setBillingDraftOwnerUserId(session.user.squadId, ownerUserId);
  return NextResponse.json({ ownerUserId: await getBillingDraftOwnerUserId(session.user.squadId) });
}
