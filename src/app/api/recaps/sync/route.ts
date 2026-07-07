import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { syncUserGmail } from "@/lib/gmail-sync";
import { revalidateTag } from "next/cache";

export async function POST() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { synced, tasksCreated } = await syncUserGmail(session.user.id);

  if (synced > 0 || tasksCreated > 0) {
    revalidateTag("recaps", "max");
    revalidateTag("tasks", "max");
  }

  if (synced === 0) {
    return NextResponse.json({ synced: 0, tasksCreated: 0, message: "Nenhuma transcrição nova encontrada." });
  }

  return NextResponse.json({ synced, tasksCreated });
}
