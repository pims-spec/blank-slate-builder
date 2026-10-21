import { useState } from "react";
import type { AnalyseUitkomst } from "@/lib/wws/portefeuille/analyse";

/**
 * Staafdiagram: aantal woningen per labelklasse (A++++ t/m G) en "geen label". Eén reeks, dus
 * één kleur (paars); "geen label" in grijs. Aantallen staan boven de staven; bij aanwijzen een
 * tooltip met aantal en percentage; klikken toont de adressen. Op telefoonbreedte liggende staven (anders worden de
 * labels onleesbaar klein). Voor schermlezers staat er een tabel onder.
 */
export function LabelGrafiek({
  uitkomst,
  onKies,
}: {
  uitkomst: AnalyseUitkomst;
  /** Klik op een staaf: de adressen van die klasse tonen */
  onKies?: (klasse: string) => void;
}) {
  const data = uitkomst.perKlasse;
  const totaal = data.reduce((s, d) => s + d.aantal, 0);
  const max = Math.max(1, ...data.map((d) => d.aantal));
  const [actief, setActief] = useState<number | null>(null);
  const B = 640,
    H = 220,
    boven = 22,
    onder = 28,
    stap = B / data.length,
    staaf = Math.min(36, stap * 0.6);
  const hoogte = (n: number) => ((H - boven - onder) * n) / max;
  const pct = (n: number) => (totaal ? Math.round((n / totaal) * 1000) / 10 : 0);

  return (
    <figure className="m-0">
      <ul className="space-y-1 sm:hidden" aria-hidden="true">
        {data.map((d) => {
          const geen = d.klasse === "geen label";
          return (
            <li key={d.klasse}>
              <button
                type="button"
                className="flex w-full items-center gap-2 rounded text-left text-xs hover:bg-secondary"
                onClick={() => onKies?.(d.klasse)}
                aria-label={
                  (geen ? "Geen label" : "Label " + d.klasse) +
                  ": " +
                  d.aantal +
                  " woningen, adressen tonen"
                }
              >
                <span className="w-12 shrink-0 text-muted-foreground">
                  {geen ? "geen" : d.klasse}
                </span>
                <span className="h-3 flex-1">
                  {d.aantal > 0 && (
                    <span
                      className={
                        "block h-full rounded-r " + (geen ? "bg-muted-foreground/45" : "bg-primary")
                      }
                      style={{ width: (d.aantal / max) * 100 + "%" }}
                    />
                  )}
                </span>
                <span className="w-8 shrink-0 text-right tabular-nums">{d.aantal}</span>
              </button>
            </li>
          );
        })}
      </ul>
      <div className="relative hidden sm:block">
        <svg
          viewBox={`0 0 ${B} ${H}`}
          className="h-auto w-full"
          role="img"
          aria-label={"Aantal woningen per labelklasse, " + totaal + " woningen"}
          onMouseLeave={() => setActief(null)}
        >
          {/* basislijn */}
          <line
            x1={0}
            x2={B}
            y1={H - onder}
            y2={H - onder}
            className="stroke-border"
            strokeWidth={1}
          />
          {data.map((d, i) => {
            const x = i * stap + (stap - staaf) / 2;
            const h = hoogte(d.aantal);
            const y = H - onder - h;
            const geen = d.klasse === "geen label";
            return (
              <g
                key={d.klasse}
                onMouseEnter={() => setActief(i)}
                onFocus={() => setActief(i)}
                onBlur={() => setActief(null)}
                onClick={() => onKies?.(d.klasse)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onKies?.(d.klasse);
                  }
                }}
                role="button"
                tabIndex={0}
                aria-label={
                  (geen ? "Geen label" : "Label " + d.klasse) +
                  ": " +
                  d.aantal +
                  " woningen, adressen tonen"
                }
                className="cursor-pointer outline-none"
              >
                {/* groot raakvlak voor aanwijzen */}
                <rect x={i * stap} y={0} width={stap} height={H - onder} fill="transparent" />
                {h > 0 && (
                  <path
                    d={`M${x},${H - onder} V${y + Math.min(4, h)} Q${x},${y} ${x + Math.min(4, h)},${y} H${x + staaf - Math.min(4, h)} Q${x + staaf},${y} ${x + staaf},${y + Math.min(4, h)} V${H - onder} Z`}
                    className={geen ? "fill-muted-foreground/45" : "fill-primary"}
                    opacity={actief === null || actief === i ? 1 : 0.55}
                  />
                )}
                <text
                  x={x + staaf / 2}
                  y={y - 6}
                  textAnchor="middle"
                  className="fill-foreground text-[11px] tabular-nums"
                >
                  {d.aantal}
                </text>
                <text
                  x={i * stap + stap / 2}
                  y={H - onder + 17}
                  textAnchor="middle"
                  className="fill-muted-foreground text-[11px]"
                >
                  {geen ? "geen" : d.klasse}
                </text>
              </g>
            );
          })}
        </svg>
        {actief !== null && (
          <div
            className="pointer-events-none absolute top-0 rounded-lg border border-border bg-popover px-2 py-1 text-xs text-popover-foreground shadow"
            style={{ left: `calc(${((actief + 0.5) / data.length) * 100}% - 60px)`, width: 120 }}
            role="status"
          >
            <div className="font-semibold">
              {data[actief]!.klasse === "geen label"
                ? "Geen label"
                : "Label " + data[actief]!.klasse}
            </div>
            <div className="tabular-nums">
              {data[actief]!.aantal} woningen · {pct(data[actief]!.aantal).toLocaleString("nl-NL")}%
            </div>
          </div>
        )}
      </div>
      <figcaption className="sr-only">
        <table>
          <caption>Woningen per labelklasse</caption>
          <tbody>
            {data.map((d) => (
              <tr key={d.klasse}>
                <th scope="row">{d.klasse}</th>
                <td>{d.aantal}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </figcaption>
    </figure>
  );
}
