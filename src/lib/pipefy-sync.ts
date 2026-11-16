// Sincroniza Temperatura/Próximos Passos/Resumo do Pipefy (Squad Gustavo) pra dentro
// de CalendarEvent — a página de reuniões do cliente lê/escreve esses mesmos
// campos manualmente, então sem isso a mesma reunião podia ter valores
// diferentes em cada lugar. Pipefy sempre vence quando os dois têm valor nessa
// direção (decisão do usuário — é o processo oficial do squad pra isso).
//
// Também tem o caminho contrário (pushCalendarEventToPipefy, chamado por
// PATCH /api/calendar/[id]): quando alguém preenche pela plataforma em vez de
// preencher no Pipefy, escreve de volta no mesmo registro — assim o próximo
// sync Pipefy→plataforma lê o valor que acabou de ser escrito e não há
// divergência real, só uma ordem de quem escreveu primeiro.
import { prisma } from "./prisma";
import { forSquad } from "./tenant-prisma";
import { knownClientNames } from "./client-resolve";
import {
  getGustavoMeetings,
  meetingsForClient,
  pushFieldsToPipefy,
  getFormularioInicialCardsPipefy,
  formularioInicialForClient,
  type Temperatura,
} from "./pipefy";
import { log } from "./logger";

const TEMP_MAP: Partial<Record<Temperatura, string>> = {
  "🔴": "critico",
  "🟡": "atencao",
  "🟢": "bom",
  // "⚪ Não qualifica" e "" ficam de fora do mapa — não sobrescreve com o quê
};

// Sentido contrário do TEMP_MAP acima — plataforma só tem 3 níveis (bom/atencao/critico,
// de propósito igual às 3 cores do Pipefy, decisão do usuário) então o mapeamento é 1:1.
const REVERSE_TEMP_MAP: Record<string, Temperatura> = {
  bom: "🟢",
  atencao: "🟡",
  critico: "🔴",
};

// Escreve de volta no Pipefy quando alguém preenche Temperatura/Próximos Passos pela
// plataforma (PATCH /api/calendar/[id]) — best-effort: nunca lança, só loga. Sem
// pipefyRecordId (reunião nunca casou com um registro do Pipefy — squad sem integração,
// cliente não casou, ou ainda não rodou o sync de hoje) não faz nada, silenciosamente.
export async function pushCalendarEventToPipefy(
  squadId: string,
  pipefyRecordId: string | null,
  fields: { temperature?: string | null; nextSteps?: string | null; resumo?: string | null; meetingOccurred?: boolean | null }
): Promise<void> {
  if (!pipefyRecordId) return;

  const push: { temperatura?: string; proximosPassos?: string; resumo?: string; statusReuniao?: string } = {};
  if (fields.temperature) {
    const mapped = REVERSE_TEMP_MAP[fields.temperature];
    if (mapped) push.temperatura = mapped;
  }
  if (fields.nextSteps) push.proximosPassos = fields.nextSteps;
  if (fields.resumo) push.resumo = fields.resumo;
  if (fields.meetingOccurred !== undefined && fields.meetingOccurred !== null) {
    push.statusReuniao = fields.meetingOccurred ? "Realizada" : "Não ocorreu";
  }
  if (Object.keys(push).length === 0) return;

  try {
    await pushFieldsToPipefy(pipefyRecordId, push);
  } catch (err) {
    await log("pipefy-sync", "Erro ao escrever de volta no Pipefy", {
      level: "error",
      detail: String(err),
      squadId,
    });
  }
}

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

      // pipefyRecordId sempre grava (mesmo sem temperatura/próximos passos/resumo ainda) —
      // é o que permite escrever de volta assim que alguém editar pela plataforma, mesmo
      // que o Pipefy ainda não tenha nada preenchido pra esse encontro
      const data: {
        temperature?: string; nextSteps?: string; resumoEditado?: string; meetingOccurred?: boolean; pipefyRecordId: string;
      } = { pipefyRecordId: meeting.id };
      const mappedTemp = TEMP_MAP[meeting.temperatura];
      if (mappedTemp) data.temperature = mappedTemp;
      if (meeting.proximosPassos.trim()) data.nextSteps = meeting.proximosPassos.trim();
      if (meeting.resumo.trim()) data.resumoEditado = meeting.resumo.trim();
      const status = meeting.status.trim();
      if (status === "Realizada") data.meetingOccurred = true;
      else if (status === "Não ocorreu") data.meetingOccurred = false;

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

// Captura uma vez o "Formulário Inicial" (card de venda ganho, pipe "1.1 Funil de Vendas -
// CFOaaS") e grava em ClientNote.formularioInicial — esse dado nunca muda depois que o
// negócio fecha, então a tela do cliente só LÊ daqui a partir de agora, sem consultar o
// Pipefy ao vivo a cada entrada (achado pelo usuário: isso deixava a tela lenta). Sobrescreve
// todo dia (idempotente, barato — ~1 fetch do Pipefy + N updates baratos) em vez de só
// preencher quando vazio, pra se autocorrigir sozinho se o backfill inicial errou algo.
export async function syncFormularioInicialForSquad(squadId: string): Promise<{ matched: number }> {
  const db = forSquad(squadId);
  const cards = await getFormularioInicialCardsPipefy();
  const names = [...(await knownClientNames(db, squadId))];

  let matched = 0;
  for (const name of names) {
    const formularioInicial = formularioInicialForClient(cards, name);
    if (!formularioInicial) continue;
    matched++;
    await db.clientNote.updateMany({ where: { client: name }, data: { formularioInicial } });
  }

  return { matched };
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

    // independente do sync de reuniões acima — um falhando não deve impedir o outro
    try {
      await syncFormularioInicialForSquad(squad.id);
    } catch (err) {
      await log("pipefy-sync", `Erro ao sincronizar Formulário Inicial do squad ${squad.name}`, {
        level: "error",
        detail: String(err),
        squadId: squad.id,
      });
    }
  }
}
