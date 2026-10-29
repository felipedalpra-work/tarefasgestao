import { revalidateTag } from "next/cache";
import type { SquadPrisma } from "./tenant-prisma";
import { getRecapAiConfig, callAiRaw } from "./ai-provider";
import { getTemperaturePrompt } from "./settings";

// Critério genérico usado até o CFO configurar o próprio (Configurações → Critério de
// Temperatura, ou o popup de primeira configuração) — nunca trava a funcionalidade.
export const DEFAULT_TEMPERATURE_PROMPT = `🟢 Bom: cliente satisfeito, sem pendências críticas, reunião produtiva, sem reclamações.
🟡 Atenção: pendências recorrentes, atrasos, dúvidas não resolvidas, leve insatisfação.
🔴 Crítico: cliente insatisfeito, risco de cancelamento/churn, problema grave sem solução encaminhada, conflito.`;

const VALID_TEMPERATURES = ["bom", "atencao", "critico"];

function dayRange(date: Date): { start: Date; end: Date } {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
  const end = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
  return { start, end };
}

// Sugere Temperatura/Próximos Passos pra reunião correspondente (mesmo cliente, mesmo dia
// de `aroundDate` — mesmo espírito do matching por cliente+dia já usado em
// src/lib/pipefy-sync.ts) a partir da transcrição de um Meet Recap. Só tenta uma vez por
// reunião (temperatureSuggestedAt) e só se ninguém já preencheu a Temperatura oficial —
// idempotente e barato re-chamar. Nunca lança: quem chama decide se loga o erro.
export async function suggestTemperatureForRecap(
  db: SquadPrisma,
  squadId: string,
  client: string,
  recapBody: string,
  aroundDate: Date
): Promise<void> {
  const { start, end } = dayRange(aroundDate);
  const event = await db.calendarEvent.findFirst({
    // janela do dia inteiro — aroundDate vem de MeetRecap.createdAt, que só existe depois
    // que a reunião já aconteceu, então não precisa de guarda extra de "já passou"
    where: { client, startAt: { gte: start, lte: end }, temperatureSuggestedAt: null, temperature: null },
    orderBy: { startAt: "asc" },
    select: { id: true },
  });
  if (!event) return;

  const prompt = await getTemperaturePrompt(squadId);
  const criteria = prompt || DEFAULT_TEMPERATURE_PROMPT;

  const fullPrompt = `Você é um assistente de CFO as a Service (O2 Inc.) avaliando o clima de uma reunião com cliente, a partir da transcrição/ata abaixo.

Critério definido pelo CFO pra classificar a Temperatura:
${criteria}

Conteúdo da reunião:
${recapBody.slice(0, 5000)}

Instruções:
- "temperature": EXATAMENTE um destes três valores: "bom", "atencao" ou "critico" — nunca outro texto.
- "nextSteps": lista objetiva dos próximos passos combinados na reunião (ou string vazia se não houver nenhum).

Retorne APENAS JSON válido sem markdown, sem blocos de código, sem explicações:
{ "temperature": "bom|atencao|critico", "nextSteps": "texto" }`;

  const aiConfig = await getRecapAiConfig(squadId);
  const raw = await callAiRaw(aiConfig, fullPrompt);
  const text = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  const result: { temperature?: string; nextSteps?: string } = jsonMatch ? JSON.parse(jsonMatch[0]) : {};

  const temperature = VALID_TEMPERATURES.includes(result.temperature ?? "") ? result.temperature! : null;

  await db.calendarEvent.update({
    where: { id: event.id },
    data: {
      suggestedTemperature: temperature,
      suggestedNextSteps: temperature ? result.nextSteps?.trim() || null : null,
      temperatureSuggestedAt: new Date(),
    },
  });

  revalidateTag("calendar", "max");
}
