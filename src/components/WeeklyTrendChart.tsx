"use client";

import { useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

export type WeeklyTrendPoint = { weekEnd: string; onTime: number; late: number; noDueDate: number };

const COLOR_ON_TIME = "#6BF169"; // o2-green — mesma cor de "concluído" no resto do app
const COLOR_LATE = "#f87171"; // red-400 — mesma cor de "atrasado"/"bloqueado" no resto do app
const COLOR_NO_DUE = "#555555"; // ink-faint — neutro, não é nem bom nem ruim

// arredonda o teto do eixo Y pra um número "redondo" (1/2/5 x 10^k), pra ticks limpos
function niceCeil(value: number): number {
  if (value <= 0) return 4;
  const exp = Math.floor(Math.log10(value));
  const base = value / 10 ** exp;
  const niceBase = base <= 1 ? 1 : base <= 2 ? 2 : base <= 5 ? 5 : 10;
  return niceBase * 10 ** exp;
}

// segmento do topo (não-zero) da pilha ganha o topo arredondado; a base fica reta,
// encostada na linha de base — os do meio são retângulos simples
function topRoundedPath(x: number, y: number, w: number, h: number, r: number): string {
  const radius = Math.min(r, w / 2, h);
  if (h <= 0) return "";
  return `M${x},${y + h} V${y + radius} Q${x},${y} ${x + radius},${y} H${x + w - radius} Q${x + w},${y} ${x + w},${y + radius} V${y + h} Z`;
}

// Gráfico de barras empilhadas por semana — concluídas no prazo / atrasadas / sem prazo.
// SVG na mão (sem lib de gráfico): a régua é o método do skill de dataviz — barra fina,
// topo arredondado só no segmento mais alto de cada pilha, gap de 2px entre segmentos,
// tooltip por barra, legenda sempre visível (3 séries).
export function WeeklyTrendChart({ data }: { data: WeeklyTrendPoint[] }) {
  const [hover, setHover] = useState<number | null>(null);

  const W = 640;
  const H = 220;
  const padLeft = 32;
  const padRight = 8;
  const padTop = 12;
  const padBottom = 26;
  const chartW = W - padLeft - padRight;
  const chartH = H - padTop - padBottom;

  const totals = data.map((d) => d.onTime + d.late + d.noDueDate);
  const maxTotal = niceCeil(Math.max(...totals, 1));
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(maxTotal * f));

  const n = Math.max(data.length, 1);
  const slot = chartW / n;
  const barW = Math.min(24, slot * 0.55);
  const gap = 2;

  function yFor(value: number) {
    return padTop + chartH - (value / maxTotal) * chartH;
  }

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label="Tarefas concluídas por semana, no prazo ou atrasadas">
        {/* gridlines horizontais, hairline e recessivas */}
        {ticks.map((t) => (
          <g key={t}>
            <line x1={padLeft} x2={W - padRight} y1={yFor(t)} y2={yFor(t)} stroke="#2a2a2a" strokeWidth={1} />
            <text x={padLeft - 6} y={yFor(t)} textAnchor="end" dominantBaseline="middle" fontSize={9} fill="#666666">
              {t}
            </text>
          </g>
        ))}

        {data.map((d, i) => {
          const x = padLeft + i * slot + (slot - barW) / 2;
          const segments = [
            { key: "onTime", value: d.onTime, color: COLOR_ON_TIME },
            { key: "late", value: d.late, color: COLOR_LATE },
            { key: "noDueDate", value: d.noDueDate, color: COLOR_NO_DUE },
          ].filter((s) => s.value > 0);

          const lastIdx = segments.length - 1;
          let cursorY = padTop + chartH; // baseline, sobe conforme empilha

          return (
            <g key={d.weekEnd} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} className="cursor-pointer">
              {/* hit area maior que a barra visual, pra facilitar o hover */}
              <rect x={padLeft + i * slot} y={padTop} width={slot} height={chartH} fill="transparent" />
              {segments.map((s, si) => {
                const h = Math.max(0, (s.value / maxTotal) * chartH - (si < lastIdx ? gap : 0));
                const y = cursorY - h;
                cursorY = y - gap;
                const isTop = si === lastIdx;
                return isTop ? (
                  <path key={s.key} d={topRoundedPath(x, y, barW, h, 4)} fill={s.color} opacity={hover === null || hover === i ? 1 : 0.35} />
                ) : (
                  <rect key={s.key} x={x} y={y} width={barW} height={h} fill={s.color} opacity={hover === null || hover === i ? 1 : 0.35} />
                );
              })}
              {segments.length === 0 && (
                <rect x={x} y={padTop + chartH - 2} width={barW} height={2} fill="#333333" rx={1} />
              )}
              <text x={x + barW / 2} y={H - 8} textAnchor="middle" fontSize={9} fill="#666666">
                {format(new Date(d.weekEnd), "dd/MM", { locale: ptBR })}
              </text>
            </g>
          );
        })}
      </svg>

      {hover !== null && data[hover] && (
        <div
          className="absolute top-0 -translate-x-1/2 bg-surface-3 border border-border rounded-lg px-3 py-2 text-xs shadow-xl pointer-events-none z-10 whitespace-nowrap"
          style={{ left: `${((hover + 0.5) / n) * 100}%` }}
        >
          <p className="text-ink-faint mb-1">{format(new Date(data[hover].weekEnd), "'semana de' dd/MM", { locale: ptBR })}</p>
          <p><span className="text-ink font-semibold">{data[hover].onTime}</span> <span style={{ color: COLOR_ON_TIME }}>no prazo</span></p>
          <p><span className="text-ink font-semibold">{data[hover].late}</span> <span style={{ color: COLOR_LATE }}>atrasada{data[hover].late !== 1 ? "s" : ""}</span></p>
          <p><span className="text-ink font-semibold">{data[hover].noDueDate}</span> <span style={{ color: COLOR_NO_DUE }}>sem prazo</span></p>
        </div>
      )}

      <div className="flex items-center gap-4 mt-3 justify-center">
        <span className="flex items-center gap-1.5 text-[11px] text-ink-mid">
          <span className="w-2.5 h-2.5 rounded-sm" style={{ background: COLOR_ON_TIME }} /> No prazo
        </span>
        <span className="flex items-center gap-1.5 text-[11px] text-ink-mid">
          <span className="w-2.5 h-2.5 rounded-sm" style={{ background: COLOR_LATE }} /> Atrasada
        </span>
        <span className="flex items-center gap-1.5 text-[11px] text-ink-mid">
          <span className="w-2.5 h-2.5 rounded-sm" style={{ background: COLOR_NO_DUE }} /> Sem prazo
        </span>
      </div>
    </div>
  );
}
