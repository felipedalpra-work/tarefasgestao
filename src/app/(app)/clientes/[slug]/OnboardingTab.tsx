"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, AlertTriangle, Clock, Calendar } from "lucide-react";
import { toast } from "@/components/Toaster";

type Milestones = {
  onboardingStartAt: string;
  cfoAllocatedAt: string;
  kickoffScheduledAt: string;
  kickoffDoneAt: string;
  setupDoneAt: string;
  diagnosticDoneAt: string;
  oxyIntegratedAt: string;
  diagnosticoHandoffAt: string;
  diagnosticoIntakeAt: string;
  diagnosticoAnaliseAt: string;
  diagnosticoValidacaoAt: string;
};

const EMPTY_MILESTONES: Milestones = {
  onboardingStartAt: "",
  cfoAllocatedAt: "",
  kickoffScheduledAt: "",
  kickoffDoneAt: "",
  setupDoneAt: "",
  diagnosticDoneAt: "",
  oxyIntegratedAt: "",
  diagnosticoHandoffAt: "",
  diagnosticoIntakeAt: "",
  diagnosticoAnaliseAt: "",
  diagnosticoValidacaoAt: "",
};

const DIAGNOSTICO_ETAPAS = [
  { key: "diagnosticoHandoffAt" as const, label: "Etapa 0 · Handoff do Setup", detail: "Plano de contas, categorização e base de CR/CP repassados — sem nova reunião." },
  { key: "diagnosticoIntakeAt" as const, label: "Etapa 1 · Intake complementar", detail: "Balanço, DFC, endividamento, Serasa, protestos, contrato social, dado de mercado — assíncrono." },
  { key: "diagnosticoAnaliseAt" as const, label: "Etapa 2 · Análise e montagem", detail: "DRE, DFC, NCG/CDG/Tesouraria, prazos, cenário macro e do segmento — trabalho de mesa." },
  { key: "diagnosticoValidacaoAt" as const, label: "Etapa 3 · Validação com o cliente", detail: "Confirma premissas e lacunas — dentro da semanal já prevista." },
];

const MILESTONE_DEFS = [
  { key: "cfoAllocatedAt" as const, label: "CFO alocado", offsetDays: 2 },
  { key: "kickoffScheduledAt" as const, label: "Kickoff agendado", offsetDays: 3 },
  { key: "kickoffDoneAt" as const, label: "Kickoff realizado", offsetDays: 7 },
  { key: "setupDoneAt" as const, label: "Setup + Comitê de Estruturação", offsetDays: 30 },
  { key: "diagnosticDoneAt" as const, label: "Diagnóstico + Comitê de Diagnóstico", offsetDays: 60 },
  { key: "oxyIntegratedAt" as const, label: "Oxy integrada + início do Comitê Estratégico Mensal", offsetDays: 90 },
];

type SetupMeeting = {
  code: "R1" | "R2" | "R3" | "R4";
  scheduledAt: string | null;
  completedAt: string | null;
  participants: string | null;
  recordingUrl: string | null;
  transcriptUrl: string | null;
  nextSteps: string | null;
};

const MEETING_LABELS: Record<string, string> = {
  R1: "Faturamento e Contas a Receber",
  R2: "Compras, Despesas, CP e Conciliação",
  R3: "Custeio e Estoque (CPV/CMV)",
  R4: "Plano de Contas (validação)",
};

function toDateInput(v: string | null) {
  if (!v) return "";
  return new Date(v).toISOString().slice(0, 10);
}

function addDays(base: string, days: number) {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
}

export function OnboardingTab({ client }: { client: string }) {
  const [milestones, setMilestones] = useState<Milestones>(EMPTY_MILESTONES);
  const [intakePendente, setIntakePendente] = useState("");
  const [meetings, setMeetings] = useState<SetupMeeting[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch(`/api/clients/${encodeURIComponent(client)}`).then((r) => r.json()),
      fetch(`/api/clients/${encodeURIComponent(client)}/setup-meetings`).then((r) => r.json()),
    ])
      .then(([note, setupMeetings]) => {
        setMilestones({
          onboardingStartAt: toDateInput(note.onboardingStartAt),
          cfoAllocatedAt: toDateInput(note.cfoAllocatedAt),
          kickoffScheduledAt: toDateInput(note.kickoffScheduledAt),
          kickoffDoneAt: toDateInput(note.kickoffDoneAt),
          setupDoneAt: toDateInput(note.setupDoneAt),
          diagnosticDoneAt: toDateInput(note.diagnosticDoneAt),
          oxyIntegratedAt: toDateInput(note.oxyIntegratedAt),
          diagnosticoHandoffAt: toDateInput(note.diagnosticoHandoffAt),
          diagnosticoIntakeAt: toDateInput(note.diagnosticoIntakeAt),
          diagnosticoAnaliseAt: toDateInput(note.diagnosticoAnaliseAt),
          diagnosticoValidacaoAt: toDateInput(note.diagnosticoValidacaoAt),
        });
        setIntakePendente(note.diagnosticoIntakePendente ?? "");
        setMeetings(setupMeetings);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, [client]);

  async function updateIntakePendente(value: string) {
    const prev = intakePendente;
    setIntakePendente(value);
    const res = await fetch(`/api/clients/${encodeURIComponent(client)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ diagnosticoIntakePendente: value || null }),
    });
    if (!res.ok) {
      setIntakePendente(prev);
      toast("Erro ao salvar", "error");
    }
  }

  async function updateMilestone(key: keyof Milestones, value: string) {
    const prev = milestones;
    setMilestones((m) => ({ ...m, [key]: value }));
    const res = await fetch(`/api/clients/${encodeURIComponent(client)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [key]: value || null }),
    });
    if (!res.ok) {
      setMilestones(prev);
      toast("Erro ao salvar", "error");
    }
  }

  async function updateMeeting(code: string, field: keyof SetupMeeting, value: string) {
    const prevMeetings = meetings;
    setMeetings((prev) => prev.map((m) => (m.code === code ? { ...m, [field]: value || null } : m)));
    const res = await fetch(`/api/clients/${encodeURIComponent(client)}/setup-meetings`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, [field]: value || null }),
    });
    if (!res.ok) {
      setMeetings(prevMeetings);
      toast("Erro ao salvar", "error");
    }
  }

  if (!loaded) return <p className="text-xs text-ink-faint text-center py-8">Carregando…</p>;

  return (
    <div className="space-y-6">
      <div>
        <label className="text-xs font-medium text-ink-mid uppercase tracking-wide block mb-1.5">
          Início do onboarding (D+0 — 1º pagamento)
        </label>
        <input
          type="date"
          value={milestones.onboardingStartAt}
          onChange={(e) => updateMilestone("onboardingStartAt", e.target.value)}
          className="bg-surface border border-surface-3 rounded-xl px-4 py-2.5 text-sm text-ink focus:outline-none focus:border-o2-green/50"
        />
        <p className="text-xs text-ink-ghost mt-1.5">
          Definir essa data gera automaticamente as entregas dos meses 4, 6 e 12 nas Tarefas do cliente.
        </p>
      </div>

      <div className="space-y-2">
        {MILESTONE_DEFS.map(({ key, label, offsetDays }) => {
          const target = milestones.onboardingStartAt ? addDays(milestones.onboardingStartAt, offsetDays) : null;
          const done = !!milestones[key];
          const overdue = !done && target !== null && target < new Date();
          return (
            <div key={key} className="bg-surface border border-surface-3 rounded-xl p-3.5 flex items-center gap-3">
              {done ? (
                <CheckCircle2 size={18} className="text-o2-green shrink-0" />
              ) : overdue ? (
                <AlertTriangle size={18} className="text-red-400 shrink-0" />
              ) : (
                <Clock size={18} className="text-ink-ghost shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-ink">{label}</p>
                <p className="text-xs text-ink-faint mt-0.5">
                  {target ? (
                    <>
                      Prazo: D+{offsetDays} ({target.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })})
                      {overdue && <span className="text-red-400 font-medium"> · atrasado</span>}
                    </>
                  ) : (
                    "Defina a data de início pra calcular o prazo"
                  )}
                </p>
              </div>
              <input
                type="date"
                value={milestones[key]}
                onChange={(e) => updateMilestone(key, e.target.value)}
                className="bg-surface-2 border border-surface-3 rounded-lg px-2 py-1.5 text-xs text-ink-soft focus:outline-none focus:border-o2-green/50"
              />
            </div>
          );
        })}
      </div>

      <div className="border-t border-surface-3 pt-4">
        <p className="text-xs font-medium text-ink-mid uppercase tracking-wide mb-3">Diagnóstico (etapas 0–3)</p>
        <div className="space-y-2">
          {DIAGNOSTICO_ETAPAS.map(({ key, label, detail }) => (
            <div key={key} className="bg-surface border border-surface-3 rounded-xl p-3.5 flex items-center gap-3">
              {milestones[key] ? (
                <CheckCircle2 size={18} className="text-o2-green shrink-0" />
              ) : (
                <Clock size={18} className="text-ink-ghost shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-ink">{label}</p>
                <p className="text-xs text-ink-faint mt-0.5">{detail}</p>
              </div>
              <input
                type="date"
                value={milestones[key]}
                onChange={(e) => updateMilestone(key, e.target.value)}
                className="bg-surface-2 border border-surface-3 rounded-lg px-2 py-1.5 text-xs text-ink-soft focus:outline-none focus:border-o2-green/50"
              />
            </div>
          ))}
          <div className="bg-surface border border-surface-3 rounded-xl p-3.5">
            <label className="text-xs text-ink-faint block mb-1.5">Etapa 1 · Documentos ainda pendentes de pedir</label>
            <input
              type="text"
              defaultValue={intakePendente}
              placeholder="Ex: Balanço, DFC, Serasa"
              onBlur={(e) => e.target.value !== intakePendente && updateIntakePendente(e.target.value)}
              className="w-full bg-surface-2 border border-surface-3 rounded-lg px-3 py-2 text-xs text-ink-soft placeholder:text-ink-ghost focus:outline-none focus:border-o2-green/50"
            />
          </div>
          <p className="text-xs text-ink-ghost">
            Etapa 4 (Apresentação final) é a única com reunião nova — acompanhe pelo marco &quot;Diagnóstico + Comitê de Diagnóstico&quot; acima.
          </p>
        </div>
      </div>

      <div className="border-t border-surface-3 pt-4">
        <p className="text-xs font-medium text-ink-mid uppercase tracking-wide mb-3">Setup: reuniões R1–R4</p>
        <div className="space-y-3">
          {meetings.map((m) => (
            <div key={m.code} className="bg-surface border border-surface-3 rounded-xl p-4">
              <p className="text-sm font-medium text-ink mb-3">
                {m.code} · {MEETING_LABELS[m.code]}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                <div>
                  <label className="text-xs text-ink-faint block mb-1">Data prevista</label>
                  <input
                    type="date"
                    value={toDateInput(m.scheduledAt)}
                    onChange={(e) => updateMeeting(m.code, "scheduledAt", e.target.value)}
                    className="w-full bg-surface-2 border border-surface-3 rounded-lg px-2 py-1.5 text-xs text-ink-soft focus:outline-none focus:border-o2-green/50"
                  />
                </div>
                <div>
                  <label className="text-xs text-ink-faint block mb-1">Data realizada</label>
                  <input
                    type="date"
                    value={toDateInput(m.completedAt)}
                    onChange={(e) => updateMeeting(m.code, "completedAt", e.target.value)}
                    className="w-full bg-surface-2 border border-surface-3 rounded-lg px-2 py-1.5 text-xs text-ink-soft focus:outline-none focus:border-o2-green/50"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                <div>
                  <label className="text-xs text-ink-faint block mb-1">Participantes</label>
                  <input
                    type="text"
                    defaultValue={m.participants ?? ""}
                    onBlur={(e) => e.target.value !== (m.participants ?? "") && updateMeeting(m.code, "participants", e.target.value)}
                    className="w-full bg-surface-2 border border-surface-3 rounded-lg px-2 py-1.5 text-xs text-ink-soft focus:outline-none focus:border-o2-green/50"
                  />
                </div>
                <div>
                  <label className="text-xs text-ink-faint block mb-1">Próximos passos</label>
                  <input
                    type="text"
                    defaultValue={m.nextSteps ?? ""}
                    onBlur={(e) => e.target.value !== (m.nextSteps ?? "") && updateMeeting(m.code, "nextSteps", e.target.value)}
                    className="w-full bg-surface-2 border border-surface-3 rounded-lg px-2 py-1.5 text-xs text-ink-soft focus:outline-none focus:border-o2-green/50"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-ink-faint block mb-1 flex items-center gap-1"><Calendar size={11} /> Gravação</label>
                  <input
                    type="text"
                    defaultValue={m.recordingUrl ?? ""}
                    placeholder="Link"
                    onBlur={(e) => e.target.value !== (m.recordingUrl ?? "") && updateMeeting(m.code, "recordingUrl", e.target.value)}
                    className="w-full bg-surface-2 border border-surface-3 rounded-lg px-2 py-1.5 text-xs text-ink-soft placeholder:text-ink-ghost focus:outline-none focus:border-o2-green/50"
                  />
                </div>
                <div>
                  <label className="text-xs text-ink-faint block mb-1">Transcrição</label>
                  <input
                    type="text"
                    defaultValue={m.transcriptUrl ?? ""}
                    placeholder="Link"
                    onBlur={(e) => e.target.value !== (m.transcriptUrl ?? "") && updateMeeting(m.code, "transcriptUrl", e.target.value)}
                    className="w-full bg-surface-2 border border-surface-3 rounded-lg px-2 py-1.5 text-xs text-ink-soft placeholder:text-ink-ghost focus:outline-none focus:border-o2-green/50"
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
