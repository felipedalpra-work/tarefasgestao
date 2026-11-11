// Integração com o Pipefy (Squad Gustavo) — leitura (painel /saude-carteira,
// sync pro CalendarEvent) e escrita (plataforma → Pipefy, ver pushFieldsToPipefy).
// Roda SÓ no servidor (usa PIPEFY_TOKEN). A API do Pipefy é bloqueada na rede
// de automação da O2, mas o backend na Vercel alcança normalmente.
import { unstable_cache } from "next/cache";

const ENDPOINT = "https://api.pipefy.com/graphql";
const PHASE_ID = 340748727; // Execução de Rotinas (3.02 Gestão de Rotinas)
const TABLE_ID = "_D-ZwqGW"; // Rotinas – Reuniões & Alinhamentos
const CFO_ASSIGNEE = "Gustavo Cochlar";
const RECENT_RECORDS = 250; // registros mais recentes a varrer (todos os squads) antes de filtrar

function getToken(): string {
  const t = process.env.PIPEFY_TOKEN;
  if (!t) throw new Error("PIPEFY_TOKEN não configurado");
  return t;
}

async function gql<T>(query: string): Promise<T> {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { Authorization: `Bearer ${getToken()}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
    cache: "no-store",
  });
  const json = await res.json();
  if (json.errors) throw new Error("Pipefy GraphQL: " + JSON.stringify(json.errors));
  return json.data as T;
}

// GraphQL permite os mesmos escapes do JSON (aspas, barra invertida, quebra de linha
// como \n) — Próximos Passos é texto livre digitado por gente, então precisa escapar
// antes de interpolar na query (a API não tem um jeito simples de passar variáveis
// aqui, só string literal).
function gqlString(value: string): string {
  return JSON.stringify(value);
}

// Escreve Temperatura e/ou Próximos Passos de volta no card/registro do Pipefy — usado
// quando alguém preenche esses campos pela plataforma (PATCH /api/calendar/[id]) em vez
// de preencher direto no Pipefy. "fieldId" é o id interno do campo (os mesmos usados pra
// ler em buildMeeting: "temperatura", "pr_ximos_passos"). Lança em caso de erro; quem
// chama decide se trata como best-effort (ver src/lib/pipefy-sync.ts).
export async function pushFieldsToPipefy(
  tableRecordId: string,
  fields: { temperatura?: string; proximosPassos?: string }
): Promise<void> {
  const values: string[] = [];
  if (fields.temperatura) values.push(`{ fieldId: "temperatura", value: ${gqlString(fields.temperatura)} }`);
  if (fields.proximosPassos !== undefined) {
    values.push(`{ fieldId: "pr_ximos_passos", value: ${gqlString(fields.proximosPassos)} }`);
  }
  if (values.length === 0) return;

  const data = await gql<{
    updateFieldsValues: { success: boolean; userErrors: { field: string; message: string }[] };
  }>(
    `mutation { updateFieldsValues(input: { nodeId: ${gqlString(tableRecordId)}, values: [${values.join(", ")}] }) { success userErrors { field message } } }`
  );
  if (!data.updateFieldsValues.success) {
    throw new Error("Pipefy updateFieldsValues falhou: " + JSON.stringify(data.updateFieldsValues.userErrors));
  }
}

type CardNode = { assignees: { name: string }[]; fields: { name: string; value: string }[] };

// Títulos (assuntos) das reuniões ligadas aos cards do Gustavo.
async function fetchGustavoTitles(): Promise<Set<string>> {
  const titles = new Set<string>();
  let after: string | null = null;
  for (let page = 0; page < 6; page++) {
    const data: { phase: { cards: { pageInfo: { hasNextPage: boolean; endCursor: string }; edges: { node: CardNode }[] } } } =
      await gql(`query { phase(id: ${PHASE_ID}) { cards(first: 50${after ? `, after: "${after}"` : ""}) { pageInfo { hasNextPage endCursor } edges { node { assignees { name } fields { name value } } } } } }`);
    const c = data.phase.cards;
    for (const { node } of c.edges) {
      if (!(node.assignees || []).some((a) => a.name === CFO_ASSIGNEE)) continue;
      const f = (node.fields || []).find((x) => x.name && x.name.toLowerCase().includes("reuni"));
      if (!f || !f.value) continue;
      try {
        for (const t of JSON.parse(f.value)) titles.add(String(t).trim());
      } catch {
        titles.add(String(f.value).trim());
      }
    }
    if (!c.pageInfo.hasNextPage) break;
    after = c.pageInfo.endCursor;
  }
  return titles;
}

type RecMeta = { id: string; title: string; created_at: string };

// Registros mais recentes da tabela (todos os squads) — usa paginação reversa (last/before).
async function fetchRecentRecords(limit = RECENT_RECORDS): Promise<RecMeta[]> {
  const out: RecMeta[] = [];
  let before: string | null = null;
  for (let page = 0; page < 8 && out.length < limit; page++) {
    const data: { table_records: { pageInfo: { hasPreviousPage: boolean; startCursor: string }; edges: { node: RecMeta }[] } } =
      await gql(`query { table_records(table_id: "${TABLE_ID}", last: 50${before ? `, before: "${before}"` : ""}) { pageInfo { hasPreviousPage startCursor } edges { node { id title created_at } } } }`);
    const t = data.table_records;
    for (const e of t.edges) out.push(e.node);
    if (!t.pageInfo.hasPreviousPage) break;
    before = t.pageInfo.startCursor;
  }
  return out;
}

type RecordFields = { id: string; record_fields: { value: string; field: { id: string } }[] };

async function fetchRecordFields(ids: string[]): Promise<Record<string, Record<string, string>>> {
  const map: Record<string, Record<string, string>> = {};
  const chunkSize = 25;
  for (let i = 0; i < ids.length; i += chunkSize) {
    const chunk = ids.slice(i, i + chunkSize);
    const parts = chunk.map((id, j) => `r${j}: table_record(id: "${id}") { id record_fields { value field { id } } }`).join("\n");
    const data = await gql<Record<string, RecordFields>>(`query { ${parts} }`);
    for (const node of Object.values(data)) {
      map[node.id] = Object.fromEntries((node.record_fields || []).map((rf) => [rf.field.id, rf.value || ""]));
    }
  }
  return map;
}

export type Temperatura = "🟢" | "🟡" | "🔴" | "⚪ Não qualifica" | "";

export type PipefyMeeting = {
  id: string;
  assunto: string;
  clientLabel: string; // nome do cliente extraído do assunto
  data: string; // como vem do Pipefy (MM/DD/YYYY)
  tipo: string;
  clientePresente: string;
  status: string;
  temperatura: Temperatura;
  observacoes: string;
  resumo: string;
  proximosPassos: string;
  linkTranscricao: string;
  linkGravacao: string;
  createdAt: string;
  preenchida: boolean; // tem temperatura ou observações
};

// "O2 Inc. & D2M Distribuidora | Semanal" -> "D2M Distribuidora"
export function extractClientLabel(assunto: string): string {
  let s = (assunto || "").trim();
  s = s.replace(/^O2\s*Inc\.?\s*&\s*/i, "");
  const cut = s.search(/\s[|–-]\s/);
  if (cut > -1) s = s.slice(0, cut);
  return s.trim();
}

function buildMeeting(id: string, f: Record<string, string>, createdAt: string): PipefyMeeting {
  const assunto = f["assunto"] || "";
  const temperatura = (f["temperatura"] || "").trim() as Temperatura;
  const observacoes = (f["observa_es_cfo"] || "").trim();
  return {
    id,
    assunto,
    clientLabel: extractClientLabel(assunto),
    data: f["data"] || "",
    tipo: f["tipo"] || "",
    clientePresente: f["cliente_presente"] || "",
    status: f["status_da_reuni_o"] || "",
    temperatura,
    observacoes,
    resumo: f["resumo"] || "",
    proximosPassos: f["pr_ximos_passos"] || "",
    linkTranscricao: f["link_da_transcri_o"] || "",
    linkGravacao: f["link_da_grava_o"] || "",
    createdAt,
    preenchida: Boolean(temperatura) || Boolean(observacoes),
  };
}

async function loadGustavoMeetings(): Promise<PipefyMeeting[]> {
  const [titles, recent] = await Promise.all([fetchGustavoTitles(), fetchRecentRecords()]);
  const matched = recent.filter((r) => titles.has((r.title || "").trim()));
  const fields = await fetchRecordFields(matched.map((r) => r.id));
  const meetings = matched
    .map((r) => (fields[r.id] ? buildMeeting(r.id, fields[r.id], r.created_at) : null))
    .filter((m): m is PipefyMeeting => m !== null);
  meetings.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
  return meetings;
}

// Resultado cacheado por 2h pra poupar a quota da API do Pipefy.
export const getGustavoMeetings = unstable_cache(loadGustavoMeetings, ["pipefy-gustavo-meetings"], {
  revalidate: 7200,
  tags: ["pipefy"],
});

// ---------- casamento com os nomes de cliente da plataforma ----------

function normalizeName(s: string): string {
  return (s || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

export function matchesClient(clientLabel: string, platformName: string): boolean {
  const a = normalizeName(clientLabel);
  const b = normalizeName(platformName);
  if (!a || !b) return false;
  if (a === b) return true;
  const shorter = a.length <= b.length ? a : b;
  const longer = a.length <= b.length ? b : a;
  return shorter.length >= 3 && longer.includes(shorter);
}

export function meetingsForClient(meetings: PipefyMeeting[], platformName: string): PipefyMeeting[] {
  return meetings.filter((m) => matchesClient(m.clientLabel, platformName));
}

// Reunião mais recente do tipo "Comitê Estratégico Mensal" (marco D+90 do playbook, ver
// memória project_cfoaas_playbook) — `meetings` já vem ordenado desc por createdAt (ver
// loadGustavoMeetings), então o primeiro match já é o mais recente.
export function latestComiteMensal(meetings: PipefyMeeting[], platformName: string): PipefyMeeting | null {
  return meetingsForClient(meetings, platformName).find((m) => /comit/i.test(m.tipo)) ?? null;
}

// ---------- jornada de onboarding (Kick-off / Diagnóstico / Oxy Integrada) ----------
// Só LEITURA — nenhuma escrita (pedido do usuário: "só pra controle do squad"). Lê o pipe
// "3.02 Gestão de Rotinas (CFO)", que modela a jornada do cliente como um card POR ENTREGA
// (não um card só migrando de fase): "Grupo Lidon" tem um card pro Diagnóstico e outro pra
// Oxy Integrada, por exemplo, então o mesmo cliente pode aparecer em mais de uma fase ao
// mesmo tempo. Cross-squad (cards de vários "Líder Responsável", não só o Gustavo) — por
// isso não tem CFO_ASSIGNEE aqui, o filtro de "é da minha carteira" é o mesmo
// matchesClient() usado no resto do arquivo.
const ONBOARDING_PIPE_PHASES: { id: number; key: OnboardingPhaseKey }[] = [
  { id: 340748725, key: "kickoff" }, // Kick-off do Projeto
  { id: 340748726, key: "diagnostico" }, // Primeiras Entregas - Diagnóstico
  { id: 340800379, key: "oxy_integrada" }, // Oxy Integrada
  { id: 340748727, key: "execucao_rotinas" }, // Execução de Rotinas (mesma fase já lida em fetchGustavoTitles)
  { id: 340748728, key: "concluido" }, // Entregue / Concluído
  { id: 341385640, key: "cancelado" }, // Cancelado
];

export type OnboardingPhaseKey = "kickoff" | "diagnostico" | "oxy_integrada" | "execucao_rotinas" | "concluido" | "cancelado";

type MilestoneKey = "kickoff" | "diagnostico" | "oxy";

// "Tipo de Entrega" do card -> qual dos 3 marcos ele representa (outros tipos, ex.
// entregas pontuais avulsas, ficam fora do escopo desta jornada)
const MILESTONE_TYPE: Record<string, MilestoneKey> = {
  "Kick-off": "kickoff",
  "Diagnóstico Financeiro": "diagnostico",
  "Oxy Integrada": "oxy",
};

// campo de data de conclusão (só vem preenchido quando o card chega em "Entregue/Concluído")
const DONE_DATE_LABEL: Record<MilestoneKey, string> = {
  kickoff: "Data do Kick-off",
  diagnostico: "Data de Conclusão",
  oxy: "Data de Entrega da Oxy",
};

type OnboardingCard = {
  client: string; // título do card no Pipefy
  milestone: MilestoneKey;
  phase: OnboardingPhaseKey;
  doneAt: string | null; // MM/DD/YYYY, só quando phase === "concluido"
  responsavel: string | null;
};

async function fetchOnboardingCardsInPhase(phaseId: number, phaseKey: OnboardingPhaseKey): Promise<OnboardingCard[]> {
  const out: OnboardingCard[] = [];
  let after: string | null = null;
  for (let page = 0; page < 20; page++) {
    const data: {
      phase: {
        cards: {
          pageInfo: { hasNextPage: boolean; endCursor: string };
          edges: { node: { title: string; fields: { name: string; value: string }[] } }[];
        };
      };
    } = await gql(
      `query { phase(id: ${phaseId}) { cards(first: 50${after ? `, after: "${after}"` : ""}) { pageInfo { hasNextPage endCursor } edges { node { title fields { name value } } } } } }`
    );
    const c = data.phase.cards;
    for (const { node } of c.edges) {
      const tipo = node.fields.find((f) => f.name === "Tipo de Entrega")?.value || "";
      const milestone = MILESTONE_TYPE[tipo];
      if (!milestone) continue;
      const doneAt = phaseKey === "concluido" ? node.fields.find((f) => f.name === DONE_DATE_LABEL[milestone])?.value || null : null;
      const respRaw = node.fields.find((f) => f.name === "Líder Responsável")?.value;
      let responsavel: string | null = null;
      if (respRaw) {
        try {
          responsavel = (JSON.parse(respRaw) as string[])[0] ?? null;
        } catch {
          responsavel = respRaw;
        }
      }
      out.push({ client: node.title, milestone, phase: phaseKey, doneAt, responsavel });
    }
    if (!c.pageInfo.hasNextPage) break;
    after = c.pageInfo.endCursor;
  }
  return out;
}

async function loadOnboardingCards(): Promise<OnboardingCard[]> {
  const perPhase = await Promise.all(ONBOARDING_PIPE_PHASES.map((p) => fetchOnboardingCardsInPhase(p.id, p.key)));
  return perPhase.flat();
}

// Cacheado por 2h, mesmo motivo/tag de getGustavoMeetings (poupar quota da API do Pipefy).
export const getOnboardingCards = unstable_cache(loadOnboardingCards, ["pipefy-onboarding-cards"], {
  revalidate: 7200,
  tags: ["pipefy"],
});

export type OnboardingMilestoneStatus = {
  status: "concluido" | "em_andamento" | "cancelado" | "nao_iniciado";
  doneAt: string | null; // MM/DD/YYYY
  responsavel: string | null;
};

export type ClientOnboardingSummary = {
  kickoff: OnboardingMilestoneStatus;
  diagnostico: OnboardingMilestoneStatus;
  oxy: OnboardingMilestoneStatus;
};

// Se houver mais de um card do mesmo tipo pro mesmo cliente (card recriado, etc.),
// prioriza o que já concluiu — nunca mostra "em andamento" se já tem um concluído.
function pickBestCard(cards: OnboardingCard[]): OnboardingCard | undefined {
  return cards.find((c) => c.phase === "concluido") ?? cards.find((c) => c.phase !== "cancelado") ?? cards[0];
}

export function onboardingSummaryForClient(cards: OnboardingCard[], platformName: string): ClientOnboardingSummary {
  const mine = cards.filter((c) => matchesClient(c.client, platformName));
  const build = (milestone: MilestoneKey): OnboardingMilestoneStatus => {
    const card = pickBestCard(mine.filter((c) => c.milestone === milestone));
    if (!card) return { status: "nao_iniciado", doneAt: null, responsavel: null };
    const status = card.phase === "concluido" ? "concluido" : card.phase === "cancelado" ? "cancelado" : "em_andamento";
    return { status, doneAt: card.doneAt, responsavel: card.responsavel };
  };
  return { kickoff: build("kickoff"), diagnostico: build("diagnostico"), oxy: build("oxy") };
}

// Linha da visão geral "Jornada de Onboarding" em /saude-carteira — um registro por
// cliente conhecido do squad (não só quem já tem reunião no Pipefy), pra dar pra ver quem
// ainda nem começou. Montada em page.tsx (combina onboardingSummaryForClient + groupByClient
// + latestComiteMensal, que vêm de fontes diferentes), só o tipo mora aqui.
export type OnboardingOverviewRow = {
  client: string;
  kickoff: OnboardingMilestoneStatus;
  diagnostico: OnboardingMilestoneStatus;
  oxy: OnboardingMilestoneStatus;
  comiteMensalData: string | null; // MM/DD/YYYY
  reunioesPendentes: number;
};

// ---------- clientes "Em Tratativa" (CS) ----------
// Só LEITURA — nunca cria/edita Tratativa sozinho. Fase "Em Tratativa" do pipe "3.00
// Central de Projetos (CS)" é onde o CS já sinaliza manualmente qual cliente está com
// atrito — mesmo cross-squad do resto do arquivo (cards de vários CFOs). O Pipefy não
// tem tipo/motivo/plano de ação (só diz QUEM), então isso vira um empurrão pra abrir a
// tratativa na plataforma com o cliente já selecionado, nunca um registro automático —
// a riqueza do fluxo (triagem/plano de ação/desfecho) só existe aqui.
const TRATATIVA_PHASE_ID = 340754913; // "Em Tratativa" (3.00 Central de Projetos (CS))

async function loadClientsEmTratativaPipefy(): Promise<string[]> {
  const out: string[] = [];
  let after: string | null = null;
  for (let page = 0; page < 5; page++) {
    const data: {
      phase: { cards: { pageInfo: { hasNextPage: boolean; endCursor: string }; edges: { node: { title: string } }[] } };
    } = await gql(
      `query { phase(id: ${TRATATIVA_PHASE_ID}) { cards(first: 50${after ? `, after: "${after}"` : ""}) { pageInfo { hasNextPage endCursor } edges { node { title } } } } }`
    );
    const c = data.phase.cards;
    for (const { node } of c.edges) out.push(node.title);
    if (!c.pageInfo.hasNextPage) break;
    after = c.pageInfo.endCursor;
  }
  return out;
}

// Cacheado 2h, mesma tag/motivo do resto da integração.
export const getClientsEmTratativaPipefy = unstable_cache(loadClientsEmTratativaPipefy, ["pipefy-em-tratativa"], {
  revalidate: 7200,
  tags: ["pipefy"],
});

// ---------- negócio fechado, cliente ainda não cadastrado na plataforma ----------
// Só LEITURA, nunca cria cliente sozinho. Fase "Contrato assinado" do pipe "1.1 Funil de
// Vendas - CFOaaS" — o contrato já foi assinado mas o card ainda não foi arquivado em
// "Ganho" (fase seguinte, histórico de TODOS os negócios já fechados, sem filtro de data —
// por isso não é essa a fonte aqui: viraria uma lista enorme de empresas antigas, muitas já
// cadastradas ou que nunca viraram cliente recorrente de CFOaaS). "Contrato assinado" é
// naturalmente pequeno (cards passam rápido por ali), então cada um é mesmo recente.
const CONTRATO_ASSINADO_PHASE_ID = 324654555; // "Contrato assinado" (1.1 Funil de Vendas - CFOaaS)

export type NegocioFechadoPipefy = {
  empresa: string;
  cnpj: string | null;
  erp: string | null;
};

async function loadNegociosFechadosPipefy(): Promise<NegocioFechadoPipefy[]> {
  const out: NegocioFechadoPipefy[] = [];
  let after: string | null = null;
  for (let page = 0; page < 5; page++) {
    const data: {
      phase: {
        cards: {
          pageInfo: { hasNextPage: boolean; endCursor: string };
          edges: { node: { title: string; fields: { name: string; value: string }[] } }[];
        };
      };
    } = await gql(
      `query { phase(id: ${CONTRATO_ASSINADO_PHASE_ID}) { cards(first: 50${after ? `, after: "${after}"` : ""}) { pageInfo { hasNextPage endCursor } edges { node { title fields { name value } } } } } }`
    );
    const c = data.phase.cards;
    for (const { node } of c.edges) {
      const empresa = node.fields.find((f) => f.name === "Empresa")?.value || node.title;
      out.push({
        empresa,
        cnpj: node.fields.find((f) => f.name === "CNPJ/EIN")?.value || null,
        erp: node.fields.find((f) => f.name === "ERP")?.value || null,
      });
    }
    if (!c.pageInfo.hasNextPage) break;
    after = c.pageInfo.endCursor;
  }
  return out;
}

// Cacheado 2h, mesma tag/motivo do resto da integração.
export const getNegociosFechadosPipefy = unstable_cache(loadNegociosFechadosPipefy, ["pipefy-contrato-assinado"], {
  revalidate: 7200,
  tags: ["pipefy"],
});

export type ClientGroup = {
  client: string;
  naoCadastrado: boolean; // veio do Pipefy mas não está na carteira da plataforma
  temperatura: Temperatura; // a da reunião mais recente
  ultimaData: string;
  pendentes: number; // reuniões ocorridas sem temperatura/observações
  meetings: PipefyMeeting[];
};

const tempRank: Record<string, number> = { "🔴": 0, "🟡": 1, "🟢": 2, "⚪ Não qualifica": 3, "": 4 };

export function groupByClient(meetings: PipefyMeeting[], platformNames: string[]): ClientGroup[] {
  const groups: ClientGroup[] = [];
  const usedMeetingIds = new Set<string>();

  const makeGroup = (client: string, ms: PipefyMeeting[], naoCadastrado: boolean): ClientGroup => {
    ms.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
    const latest = ms[0];
    return {
      client,
      naoCadastrado,
      temperatura: latest ? latest.temperatura : "",
      ultimaData: latest ? latest.data : "",
      pendentes: ms.filter((m) => !m.preenchida).length,
      meetings: ms,
    };
  };

  for (const name of platformNames) {
    const ms = meetings.filter((m) => matchesClient(m.clientLabel, name));
    if (!ms.length) continue;
    ms.forEach((m) => usedMeetingIds.add(m.id));
    groups.push(makeGroup(name, ms, false));
  }

  // reuniões do Pipefy que não casaram com nenhum cliente cadastrado — agrupa pelo rótulo do Pipefy
  const leftovers = meetings.filter((m) => !usedMeetingIds.has(m.id));
  const byLabel = new Map<string, PipefyMeeting[]>();
  for (const m of leftovers) {
    const key = m.clientLabel || m.assunto;
    if (!byLabel.has(key)) byLabel.set(key, []);
    byLabel.get(key)!.push(m);
  }
  for (const [label, ms] of byLabel) groups.push(makeGroup(label, ms, true));

  groups.sort((a, b) => {
    const r = (tempRank[a.temperatura] ?? 5) - (tempRank[b.temperatura] ?? 5);
    if (r !== 0) return r;
    return (b.ultimaData || "").localeCompare(a.ultimaData || "");
  });
  return groups;
}
