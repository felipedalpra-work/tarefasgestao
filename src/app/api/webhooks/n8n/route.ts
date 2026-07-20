import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { log } from "@/lib/logger";
import { findDuplicateNote } from "@/lib/duplicate-detection";

// O workflow n8n (extração de tarefas de Meet Recap via Gemini, node
// "11 | Slack Lists | Build Tasks Payload") usa prioridade em P0/P1/P2 — aqui
// convertemos pra escala do nosso app (high/medium/low). P0 trava
// fechamento/pagamento do dia (~alta), P2 é rotina sem urgência (~baixa).
const PRIORITY_MAP: Record<string, string> = {
  p0: "high",
  p1: "medium",
  p2: "low",
  high: "high",
  medium: "medium",
  low: "low",
};

function normalizePriority(value: unknown): string | null {
  if (typeof value !== "string") return null;
  return PRIORITY_MAP[value.trim().toLowerCase()] ?? null;
}

// Endpoint chamado pelo workflow n8n da colega de squad, que hoje só manda os
// itens gerados pra uma lista no Slack. Aqui eles entram como sugestão pendente
// (mesmo espírito das sugestões de Meet Recap) — revisão em /sugestoes-ia.
export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!process.env.N8N_WEBHOOK_SECRET || auth !== `Bearer ${process.env.N8N_WEBHOOK_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  if (!body?.title) {
    return NextResponse.json({ error: "title é obrigatório" }, { status: 400 });
  }

  const duplicateNote = await findDuplicateNote(body.title, body.client || null);

  const suggestion = await prisma.externalSuggestion.create({
    data: {
      source: "n8n",
      sourceRef: body.sourceRef || null,
      title: body.title,
      description: body.description || null,
      client: body.client || null,
      priority: normalizePriority(body.priority),
      dueDate: body.dueDate ? new Date(body.dueDate) : null,
      status: duplicateNote ? "duplicate" : "pending",
      duplicateNote,
      meetingTitle: body.meetingTitle || null,
      meetingDate: body.meetingDate ? new Date(body.meetingDate) : null,
    },
  });

  await log("n8n", `Nova sugestão recebida do workflow n8n: "${suggestion.title}"`);

  return NextResponse.json(suggestion, { status: 201 });
}
