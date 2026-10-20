// Sincroniza Temperatura/Próximos Passos do Pipefy (Squad Gustavo) pra dentro
// de CalendarEvent — a Revisão Semanal lê/escreve esses mesmos campos
// manualmente, então sem isso a mesma reunião podia ter temperatura diferente
// em cada lugar. Pipefy sempre vence quando os dois têm valor (decisão do
// usuário — é o processo oficial do squad pra isso). Observações/Resumo do
// Pipefy não entram aqui, de propósito — não existe campo equivalente em
// CalendarEvent (só `nextSteps`), continuam só no painel de leitura
// (/saude-carteira, PipefyClientBlock).
import { prisma } from "./prisma";
import { forSquad } from "./tenant-prisma";
import { knownClientNames } from "./client-resolve";
import { getGustavoMeetings, meetingsForClient, type Temperatura } from "./pipefy";
import { log } from "./logger";

const TEMP_MAP: Partial<Record<Temperatura, string>> = {
  "🔴": "critico",
  "🟡": "atencao",
  "🟢": "bom",
  // "⚪ Não qualifica" e "" ficam de fora do mapa — não sobrescreve com o quê
};

// Pipefy devolve a data como MM/DD/YYYY, sem hora.
function parsePipefyDate(d: string): { start: Date; end: Date } | null {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec((d || "").trim());
  if (!m) return null;
  const [, mm, dd, yyyy] = m;
  const start = new Date(Number(yyyy), Number(mm) - 1, Number(dd), 0, 0, 0, 0);
  const end = new Date(Number(yyyy), Number(mm) - 1, Number(dd), 23, 59, 59, 999);
  return { start, end };
}

export async function syncPipefyMeetingsForSquad(squadId: string): Promise<{ matched: number; updated: number }> {
  const db = forSquad(squadId);
  const meetings = await getGustavoMeetings();
  const names = [...(await knownClientNames(db, squadId))];

  let matched = 0;
  let updated = 0;

  for (const name of names) {
    const clientMeetings = meetingsForClient(meetings, name);
    for (const meeting of clientMeetings) {
      const range = parsePipefyDate(meeting.data);
      if (!range) continue;

      const data: { temperature?: string; nextSteps?: string } = {};
      const mappedTemp = TEMP_MAP[meeting.temperatura];
      if (mappedTemp) data.temperature = mappedTemp;
      if (meeting.proximosPassos.trim()) data.nextSteps = meeting.proximosPassos.trim();
      if (Object.keys(data).length === 0) continue;

      matched++;
      const { count } = await db.calendarEvent.updateMany({
        where: { client: name, startAt: { gte: range.start, lte: range.end } },
        data,
      });
      updated += count;
    }
  }

  return { matched, updated };
}

// Roda 1x/dia via cron (ver /api/cron/[job] e .github/workflows/cron.yml, job
// "pipefy-sync") — um squad falhando (token ruim, Pipefy fora do ar) não trava
// os outros, só loga; diferente do backup diário, não alerta os owners por
// e-mail (isso é enriquecimento, não dado que se perde — o próximo ciclo tenta
// de novo sozinho).
export async function syncAllSquadsPipefy(): Promise<void> {
  const squads = await prisma.squad.findMany({ select: { id: true, name: true } });
  for (const squad of squads) {
    try {
      const { matched, updated } = await syncPipefyMeetingsForSquad(squad.id);
      if (updated > 0) {
        await log("pipefy-sync", `${updated} reunião(ões) atualizada(s) a partir do Pipefy`, {
          detail: `${matched} reunião(ões) do Pipefy casadas com a carteira`,
          squadId: squad.id,
        });
      }
    } catch (err) {
      await log("pipefy-sync", `Erro ao sincronizar Pipefy do squad ${squad.name}`, {
        level: "error",
        detail: String(err),
        squadId: squad.id,
      });
    }
  }
}
