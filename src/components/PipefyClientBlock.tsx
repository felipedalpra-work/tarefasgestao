// Bloco somente-leitura com a saúde/reuniões do cliente vindas do Pipefy.
// Server component — reaproveita o cache de getGustavoMeetings.
import {
  getGustavoMeetings,
  meetingsForClient,
  getOnboardingCards,
  onboardingSummaryForClient,
  type Temperatura,
  type ClientOnboardingSummary,
  type OnboardingMilestoneStatus,
} from "@/lib/pipefy";
import { ExternalLink } from "lucide-react";
import { Linkify } from "./Linkify";

const DOT: Record<string, string> = {
  "🔴": "bg-red-500",
  "🟡": "bg-amber-400",
  "🟢": "bg-o2-green",
  "⚪ Não qualifica": "bg-ink-dim/50",
  "": "bg-ink-dim/40",
};
const LABEL: Record<string, string> = {
  "🔴": "Vermelho",
  "🟡": "Amarelo",
  "🟢": "Verde",
  "⚪ Não qualifica": "Não qualifica",
  "": "Sem leitura",
};

function fmt(d: string): string {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec((d || "").trim());
  if (!m) return d || "—";
  return `${m[2].padStart(2, "0")}/${m[1].padStart(2, "0")}/${m[3]}`;
}

const MILESTONE_STATUS_META: Record<OnboardingMilestoneStatus["status"], { icon: string; className: string }> = {
  concluido: { icon: "✅", className: "text-o2-green" },
  em_andamento: { icon: "⏳", className: "text-amber-400" },
  cancelado: { icon: "⛔", className: "text-ink-dim" },
  nao_iniciado: { icon: "⬜", className: "text-ink-dim/60" },
};

function MilestonePill({ label, info, fmt }: { label: string; info: OnboardingMilestoneStatus; fmt: (d: string) => string }) {
  const meta = MILESTONE_STATUS_META[info.status];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.02] px-2.5 py-1 ${meta.className}`}>
      {meta.icon} {label}
      {info.doneAt ? ` · ${fmt(info.doneAt)}` : ""}
    </span>
  );
}

export async function PipefyClientBlock({ client }: { client: string }) {
  let meetings;
  try {
    meetings = meetingsForClient(await getGustavoMeetings(), client);
  } catch {
    return null; // sem token ou falha — não quebra a página do cliente
  }
  if (!meetings.length) return null;

  // jornada de onboarding (Kick-off/Diagnóstico/Oxy Integrada) + comitê mensal — só pra
  // controle do squad (leitura), nunca escreve no Pipefy. Best-effort: se falhar, só essa
  // faixa some, o resto do bloco (já validado acima) continua normal.
  let onboarding: ClientOnboardingSummary | null = null;
  try {
    onboarding = onboardingSummaryForClient(await getOnboardingCards(), client);
  } catch {
    onboarding = null;
  }
  const comiteMensal = meetings.find((m) => /comit/i.test(m.tipo)) ?? null;

  const latest = meetings[0];
  const temp = (latest.temperatura || "") as Temperatura;

  return (
    <section className="mb-8 rounded-xl border border-white/10 bg-white/[0.02] p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-ink">Pipefy — Reuniões & Temperatura</h2>
        <span className="inline-flex items-center gap-1.5 text-xs text-ink-mid">
          <span className={`w-2.5 h-2.5 rounded-full ${DOT[temp] ?? DOT[""]}`} />
          {LABEL[temp] ?? LABEL[""]}
        </span>
      </div>
      {onboarding && (
        <div className="mb-3 flex flex-wrap gap-2 text-xs">
          <MilestonePill label="Kick-off" info={onboarding.kickoff} fmt={fmt} />
          <MilestonePill label="Diagnóstico" info={onboarding.diagnostico} fmt={fmt} />
          <MilestonePill label="Oxy Integrada" info={onboarding.oxy} fmt={fmt} />
          <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.02] px-2.5 py-1 text-ink-mid">
            {comiteMensal ? `🗓️ Comitê mensal · ${fmt(comiteMensal.data)}` : "⬜ Comitê mensal"}
          </span>
        </div>
      )}
      <div className="space-y-2">
        {meetings.slice(0, 3).map((m) => (
          <div key={m.id} className="rounded-lg bg-white/[0.02] border border-white/5 p-3">
            <div className="flex items-center gap-2 flex-wrap text-xs text-ink-dim">
              <span className={`w-2 h-2 rounded-full ${DOT[m.temperatura] ?? DOT[""]}`} />
              <span className="text-ink-mid font-medium">{fmt(m.data)}</span>
              {m.tipo && <span>· {m.tipo}</span>}
              {!m.preenchida && <span className="text-amber-400">· sem preenchimento</span>}
            </div>
            {m.observacoes && <p className="text-sm text-ink-mid whitespace-pre-wrap break-words mt-1.5"><Linkify text={m.observacoes} /></p>}
            {m.linkTranscricao && (
              <a href={m.linkTranscricao} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-o2-green hover:underline mt-1.5">
                <ExternalLink size={12} /> Transcrição
              </a>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
