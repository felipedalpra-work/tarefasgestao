import ExcelJS from "exceljs";
import type { SquadExport } from "@/lib/squad-export";

// Porta server-side de scripts/__export-to-excel.mjs (mesmas abas, mesmas
// colunas) — usado pelo backup diário por e-mail (src/lib/backup-email.ts).
// Recebe o payload direto (em vez de ler de um .json em disco) e devolve o
// buffer do .xlsx pronto pra anexar no e-mail.

type Task = SquadExport["tasks"][number];

function userName(usersById: Map<string, SquadExport["users"][number]>, id: string | null) {
  if (!id) return null;
  const u = usersById.get(id);
  return u ? u.name || u.email : null;
}

function respName(usersById: Map<string, SquadExport["users"][number]>, t: Task) {
  if (t.assignees && t.assignees.length > 0) {
    return t.assignees
      .map((a) => {
        if (a.isClient) return "Cliente" + (a.contactName ? ` (contato: ${a.contactName})` : "");
        return userName(usersById, a.userId) || "?";
      })
      .join(" + ");
  }
  if (t.assigneeId) return userName(usersById, t.assigneeId) || "?";
  if (t.deliverTo === "o2") return "Cliente" + (t.clientContactName ? ` (contato: ${t.clientContactName})` : "");
  return "sem responsável";
}

function fmtDate(v: Date | string | null | undefined) {
  if (!v) return "";
  return new Date(v).toLocaleDateString("pt-BR");
}
function fmtDateTime(v: Date | string | null | undefined) {
  if (!v) return "";
  return new Date(v).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

const STATUS_LABEL: Record<string, string> = { todo: "A fazer", in_progress: "Em andamento", blocked: "Bloqueado", done: "Concluído" };
const PRIORITY_LABEL: Record<string, string> = { high: "Alta", medium: "Média", low: "Baixa" };

function addSheet(
  wb: ExcelJS.Workbook,
  name: string,
  columns: Partial<ExcelJS.Column>[],
  rows: Record<string, unknown>[]
) {
  const ws = wb.addWorksheet(name, { views: [{ state: "frozen", ySplit: 1 }] });
  ws.columns = columns;
  ws.getRow(1).font = { bold: true };
  ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE8F5E9" } };
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };
  rows.forEach((r) => ws.addRow(r));
  return ws;
}

export async function buildExportWorkbookBuffer(data: SquadExport): Promise<Buffer> {
  const usersById = new Map(data.users.map((u) => [u.id, u]));

  const wb = new ExcelJS.Workbook();
  wb.creator = "O2 Squad Tasks — backup diário";
  wb.created = new Date();

  const resumoWs = wb.addWorksheet("Resumo");
  resumoWs.columns = [{ header: "Item", key: "item", width: 40 }, { header: "Valor", key: "valor", width: 50 }];
  resumoWs.getRow(1).font = { bold: true };
  [
    ["Backup gerado em", fmtDateTime(data.exportedAt)],
    ["Squad", data.squad?.name ?? ""],
    ["Tarefas", data.tasks.length],
    ["  — em aberto", data.tasks.filter((t) => t.status !== "done").length],
    ["  — concluídas", data.tasks.filter((t) => t.status === "done").length],
    ["Clientes (carteira)", data.clientNotes.length],
    ["Reuniões de calendário", data.calendarEvents.length],
    ["Meet Recaps", data.meetRecaps.length],
    ["Sugestões da IA (recap)", data.meetRecaps.reduce((s, r) => s + (r.suggestions?.length ?? 0), 0)],
    ["Sugestões externas (n8n)", data.externalSuggestions.length],
    ["Tratativas", data.tratativas.length],
    ["Reuniões de setup", data.setupMeetings.length],
    ["Fechamentos mensais", data.fechamentosMensais.length],
    ["Automações", data.automations.length],
    ["Pessoas do squad", data.users.length],
  ].forEach((r) => resumoWs.addRow(r));
  resumoWs.getColumn(2).alignment = { wrapText: true, vertical: "top" };

  addSheet(
    wb,
    "Tarefas",
    [
      { header: "Título", key: "t", width: 40 },
      { header: "Cliente", key: "c", width: 22 },
      { header: "Status", key: "s", width: 14 },
      { header: "Prioridade", key: "p", width: 12 },
      { header: "Responsável(is)", key: "r", width: 30 },
      { header: "Prazo", key: "d", width: 12 },
      { header: "Descrição", key: "desc", width: 60 },
      { header: "Origem", key: "o", width: 14 },
      { header: "Reunião de origem", key: "m", width: 26 },
      { header: "Recorrência", key: "rec", width: 14 },
      { header: "Criada em", key: "ca", width: 18 },
      { header: "Atualizada em", key: "ua", width: 18 },
    ],
    [...data.tasks]
      .sort(
        (a, b) =>
          Number(a.status === "done") - Number(b.status === "done") ||
          (a.dueDate ? String(a.dueDate) : "9999").localeCompare(b.dueDate ? String(b.dueDate) : "9999")
      )
      .map((t) => ({
        t: t.title, c: t.client || "", s: STATUS_LABEL[t.status] || t.status, p: PRIORITY_LABEL[t.priority] || t.priority,
        r: respName(usersById, t), d: fmtDate(t.dueDate), desc: t.description || "", o: t.source, m: t.meetingTitle || "",
        rec: t.recurrence || "", ca: fmtDateTime(t.createdAt), ua: fmtDateTime(t.updatedAt),
      }))
  );

  addSheet(
    wb,
    "Clientes",
    [
      { header: "Cliente", key: "c", width: 26 }, { header: "Status", key: "s", width: 12 },
      { header: "Saúde", key: "h", width: 12 }, { header: "Estágio Oxy", key: "o", width: 18 },
      { header: "ERP", key: "erp", width: 16 }, { header: "Modo de acesso", key: "am", width: 20 },
      { header: "Notas", key: "n", width: 50 }, { header: "Contatos", key: "ct", width: 30 },
      { header: "Pendência Oxy", key: "op", width: 30 }, { header: "Quem resolve pendência", key: "opw", width: 22 },
      { header: "Início onboarding", key: "ob", width: 16 },
    ],
    data.clientNotes.map((c) => ({
      c: c.client, s: c.status, h: c.healthStatus, o: c.oxyStage, erp: c.erp || "", am: c.accessMode || "",
      n: c.notes || "", ct: c.contacts || "", op: c.oxyPendencies || "", opw: c.pendencyWho || "", ob: fmtDate(c.onboardingStartAt),
    }))
  );

  addSheet(
    wb,
    "Reuniões",
    [
      { header: "Título", key: "t", width: 34 }, { header: "Cliente", key: "c", width: 22 },
      { header: "Início", key: "s", width: 18 }, { header: "Fim", key: "e", width: 18 },
      { header: "Tipo", key: "mt", width: 12 }, { header: "Temperatura", key: "tp", width: 12 },
      { header: "Próximos passos", key: "ns", width: 50 },
    ],
    [...data.calendarEvents]
      .sort((a, b) => String(a.startAt).localeCompare(String(b.startAt)))
      .map((e) => ({ t: e.title, c: e.client, s: fmtDateTime(e.startAt), e: fmtDateTime(e.endAt), mt: e.meetingType || "", tp: e.temperature || "", ns: e.nextSteps || "" }))
  );

  addSheet(
    wb,
    "Meet Recaps",
    [
      { header: "Assunto", key: "s", width: 40 }, { header: "Cliente", key: "c", width: 22 },
      { header: "Origem", key: "src", width: 12 }, { header: "Criado em", key: "ca", width: 18 },
      { header: "Processado em", key: "pa", width: 18 }, { header: "Corpo (texto)", key: "b", width: 80 },
    ],
    data.meetRecaps.map((r) => ({ s: r.subject, c: r.client || "", src: r.source, ca: fmtDateTime(r.createdAt), pa: fmtDateTime(r.processedAt), b: (r.body || "").slice(0, 30000) }))
  );

  const sugestoes = [
    ...data.meetRecaps.flatMap((r) => (r.suggestions ?? []).map((s) => ({ ...s, origem: `Meet Recap: ${r.subject}`, cliente: r.client }))),
    ...data.externalSuggestions.map((s) => ({ ...s, origem: "Automação (n8n)", cliente: s.client })),
  ];
  addSheet(
    wb,
    "Sugestões",
    [
      { header: "Título", key: "t", width: 36 }, { header: "Cliente", key: "c", width: 22 },
      { header: "Status", key: "s", width: 12 }, { header: "Prioridade", key: "p", width: 12 },
      { header: "Prazo sugerido", key: "d", width: 14 }, { header: "Descrição", key: "desc", width: 55 },
      { header: "Origem", key: "o", width: 30 },
    ],
    sugestoes.map((s) => ({ t: s.title, c: s.cliente || "", s: s.status, p: PRIORITY_LABEL[s.priority ?? ""] || s.priority || "", d: fmtDate(s.dueDate), desc: s.description || "", o: s.origem }))
  );

  addSheet(
    wb,
    "Tratativas",
    [
      { header: "Cliente", key: "c", width: 22 }, { header: "Tipo", key: "tp", width: 12 },
      { header: "Motivo", key: "m", width: 30 }, { header: "Descrição", key: "d", width: 45 },
      { header: "Status", key: "s", width: 16 }, { header: "Responsável", key: "r", width: 20 },
      { header: "Criada por", key: "cb", width: 20 }, { header: "Prazo p/ finalizar", key: "df", width: 16 },
      { header: "Plano de ação", key: "pa", width: 40 }, { header: "Desfecho", key: "ds", width: 16 },
      { header: "Criada em", key: "ca", width: 18 },
    ],
    data.tratativas.map((t) => ({
      c: t.client, tp: t.tipo, m: t.motivo, d: t.descricao || "", s: t.status, r: userName(usersById, t.responsavelId) || "",
      cb: userName(usersById, t.createdById) || "", df: fmtDate(t.dataPrevistaFinalizacao), pa: t.planoDeAcao || "", ds: t.desfecho || "", ca: fmtDateTime(t.createdAt),
    }))
  );

  addSheet(
    wb,
    "Fechamentos",
    [
      { header: "Cliente", key: "c", width: 22 }, { header: "Ano", key: "y", width: 8 }, { header: "Mês", key: "m", width: 8 },
      { header: "Comitê realizado", key: "cr", width: 16 }, { header: "Rebalanceamento", key: "rb", width: 16 },
      { header: "Conciliação ok", key: "co", width: 14 }, { header: "CP/CR fechados", key: "cf", width: 14 },
      { header: "Maturidade", key: "mt", width: 20 }, { header: "Pendências", key: "p", width: 40 },
    ],
    data.fechamentosMensais.map((f) => ({
      c: f.client, y: f.year, m: f.month, cr: f.comiteRealizado ? "Sim" : "Não", rb: f.rebalanceamentoFeito ? "Sim" : "Não",
      co: f.conciliacaoOk ? "Sim" : "Não", cf: f.cpCrFechados ? "Sim" : "Não", mt: f.maturidade || "", p: f.pendenciasAnotadas || "",
    }))
  );

  addSheet(
    wb,
    "Setup",
    [
      { header: "Cliente", key: "c", width: 22 }, { header: "Código", key: "code", width: 10 },
      { header: "Agendada", key: "s", width: 16 }, { header: "Concluída", key: "d", width: 16 },
      { header: "Participantes", key: "p", width: 30 }, { header: "Próximos passos", key: "n", width: 40 },
    ],
    data.setupMeetings.map((m) => ({ c: m.client, code: m.code, s: fmtDate(m.scheduledAt), d: fmtDate(m.completedAt), p: m.participants || "", n: m.nextSteps || "" }))
  );

  addSheet(
    wb,
    "Automações",
    [
      { header: "Nome", key: "n", width: 30 }, { header: "Cliente", key: "c", width: 22 },
      { header: "Agenda", key: "s", width: 20 }, { header: "Habilitada", key: "e", width: 12 },
      { header: "Última execução", key: "l", width: 18 }, { header: "Último status", key: "ls", width: 14 },
      { header: "Resumo", key: "sum", width: 40 },
    ],
    data.automations.map((a) => ({ n: a.name, c: a.client || "", s: a.scheduleLabel, e: a.enabled ? "Sim" : "Não", l: fmtDateTime(a.lastRunAt), ls: a.lastStatus || "", sum: a.lastSummary || "" }))
  );

  addSheet(
    wb,
    "Equipe",
    [
      { header: "Nome", key: "n", width: 24 }, { header: "E-mail", key: "e", width: 30 },
      { header: "Cargo", key: "c", width: 20 }, { header: "Papel", key: "r", width: 12 },
    ],
    data.users.map((u) => ({ n: u.name || "", e: u.email, c: u.cargo || "", r: u.role === "admin" ? "Admin" : "Membro" }))
  );

  const arrayBuffer = await wb.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}
