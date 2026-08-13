import { NextRequest, NextResponse } from "next/server";
import { forSquad } from "@/lib/tenant-prisma";
import { log } from "@/lib/logger";
import { findDuplicateNote } from "@/lib/duplicate-detection";
import { resolveSquadIdByN8nSecret } from "@/lib/settings";

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

// Endpoint chamado pelo workflow n8n de cada squad, que hoje só manda os itens
// gerados pra uma lista no Slack. Aqui eles entram como sugestão pendente (mesmo
// espírito das sugestões de Meet Recap) — revisão em /sugestoes-ia. Não tem
// squadId na URL (uma única rota pra todo mundo) — o secret em si é quem
// identifica de qual squad veio a chamada (gerado por squad em Configurações).
export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization");
  const token = auth?.startsWith("Bearer ") ? auth.slice("Bearer ".length) : "";
  const squadId = await resolveSquadIdByN8nSecret(token);
  if (!squadId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  if (!body?.title) {
    return NextResponse.json({ error: "title é obrigatório" }, { status: 400 });
  }

  const db = forSquad(squadId);

  const duplicateNote = await findDuplicateNote(
    squadId,
    body.title,
    body.client || null,
    body.dueDate ? new Date(body.dueDate) : null
  );

  const suggestion = await db.externalSuggestion.create({
    data: {
      squadId,
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
