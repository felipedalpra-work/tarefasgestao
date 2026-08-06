import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { processRecap } from "@/lib/process-recap";
import { findSimilarRecap } from "@/lib/duplicate-detection";
import { revalidateTag } from "next/cache";

// Upload manual de transcrição (ex.: reunião sem Meet Recap por e-mail, ou de outra
// ferramenta). Cria o MeetRecap com source "manual" e já processa com a IA na hora —
// diferente do fluxo do Gmail, aqui não existe pausa de extração: quem envia já quer
// ver as sugestões, é uma ação explícita da pessoa, não um job em background.
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { subject, body, force } = await req.json();
  if (typeof subject !== "string" || !subject.trim()) {
    return NextResponse.json({ error: "Informe um título pra transcrição." }, { status: 400 });
  }
  if (typeof body !== "string" || body.trim().length < 20) {
    return NextResponse.json({ error: "Transcrição muito curta pra IA analisar." }, { status: 400 });
  }

  if (!force) {
    const similar = await findSimilarRecap(subject.trim(), body);
    if (similar) {
      return NextResponse.json(
        { duplicate: { id: similar.id, subject: similar.subject, createdAt: similar.createdAt, reason: similar.reason } },
        { status: 409 }
      );
    }
  }

  const recap = await prisma.meetRecap.create({
    data: {
      subject: subject.trim().slice(0, 255),
      body,
      source: "manual",
      uploadedById: session.user.id,
    },
  });

  const count = await processRecap(recap.id);

  const suggestions = await prisma.recapSuggestion.findMany({
    where: { recapId: recap.id, status: { not: "superseded" } },
    orderBy: { index: "asc" },
  });

  revalidateTag("recaps", "max");

  return NextResponse.json({ recapId: recap.id, count, suggestions });
}
