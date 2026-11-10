import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { syncUserGmail } from "@/lib/gmail-sync";
import { revalidateTag } from "next/cache";

// mesmo motivo de /api/cron/[job] (job "gmail-sync"): esse botão também passa pelo loop de
// processRecap em syncUserGmail, que pode levar dezenas de segundos por recap pendente.
export const maxDuration = 60;

export async function POST() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { synced, suggestionsExtracted } = await syncUserGmail(session.user.id);

  if (synced > 0) {
    revalidateTag("recaps", "max");
  }

  if (synced === 0) {
    return NextResponse.json({ synced: 0, suggestionsExtracted: 0, message: "Nenhuma transcrição nova encontrada." });
  }

  return NextResponse.json({ synced, suggestionsExtracted });
}
