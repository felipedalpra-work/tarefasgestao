// Integração somente-leitura com o Pipefy (Squad Gustavo).
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
