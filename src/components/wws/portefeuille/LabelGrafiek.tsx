import { useState } from "react";
import type { AnalyseUitkomst } from "@/lib/wws/portefeuille/analyse";

/**
 * Staafdiagram: aantal woningen per labelklasse (A++++ t/m G) en "geen label". Eén reeks, dus
 * één kleur (paars); "geen label" in grijs. Aantallen staan boven de staven; bij aanwijzen een
 * tooltip met aantal en percentage. Voor schermlezers staat er een tabel onder.
 */
export function LabelGrafiek({ uitkomst }: { uitkomst: AnalyseUitkomst }) {
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
      <div className="relative">
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
                tabIndex={-1}
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
            className="pointer-events-none absolute top-0 rounded-md border border-border bg-popover px-2 py-1 text-xs text-popover-foreground shadow"
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
