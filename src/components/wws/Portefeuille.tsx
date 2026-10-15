import { useMemo, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import type { Rechten } from "@/lib/rollen";
import { eur, fmt } from "@/lib/wws";
import { berekenDashboard, histogram, type Dashboard } from "@/lib/wws/dashboard";
import { DASHBOARD_VERSIE_LIMIET, tellingTitel, type Telling } from "@/lib/wws/opslag";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { maakDashboardPdf } from "@/lib/wws/pdf/rapporten";
import { useNormen } from "./NormenContext";
import { useDownload } from "./useDownload";
import { dashboardVersiesQuery, klantenQuery, tellingenQuery } from "./tellingStore";

const datumKort = (d: Date) =>
  d.toLocaleDateString("nl-NL", { day: "numeric", month: "short", year: "numeric" });

/** Dashboard: portefeuille-overzicht voor admins en de kijkrol — renderDashboard() */
export default function Portefeuille({ rechten }: { rechten: Rechten }) {
  const N = useNormen();
  const tellingen = useQuery(tellingenQuery());
  const versies = useQuery(dashboardVersiesQuery());
  const { data: klanten = [] } = useQuery(klantenQuery());
  const [klantId, setKlantId] = useState("");
  const download = useDownload();

  const D = useMemo(
    () =>
      tellingen.data && versies.data
        ? berekenDashboard(tellingen.data, versies.data.versies, N, { klantId })
        : null,
    [tellingen.data, versies.data, N, klantId],
  );
  const collegaNaam = useMemo(() => {
    const m = new Map<string, string>();
    for (const t of tellingen.data ?? []) if (t.ownerNaam) m.set(t.ownerId, t.ownerNaam);
    return (id: string) => m.get(id) ?? "Onbekende gebruiker";
  }, [tellingen.data]);

  const fout = tellingen.error ?? versies.error;

  /** PDF van het dashboard, voor de gekozen eigenaar — makeDashboardPdf() */
  function pdf() {
    if (!D) return;
    if (!D.totaal) {
      toast("Niets om te exporteren: geen tellingen voor deze keuze.");
      return;
    }
    void download.pdf("dashboard", (lib) =>
      maakDashboardPdf(lib, {
        S: D,
        normen: N,
        klantId,
        klantNaam: klanten.find((k) => k.id === klantId)?.naam ?? "",
        isAdmin: rechten.isAdmin,
        eigenaarNaam: collegaNaam,
      }),
    );
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Overzicht van de portefeuille, live herberekend met de huidige normen.
          </p>
        </div>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-xs text-muted-foreground">Eigenaar</span>
          <select
            className="h-9 rounded-md border border-input bg-background px-2 text-sm"
            value={klantId}
            onChange={(e) => setKlantId(e.target.value)}
          >
            <option value="">Alle eigenaren</option>
            {klanten.map((k) => (
              <option key={k.id} value={k.id}>
                {k.naam}
              </option>
            ))}
          </select>
        </label>
        <Button variant="outline" onClick={pdf} disabled={!D || !!download.bezig}>
          {download.bezig ? "PDF maken…" : "Dashboard als PDF"}
        </Button>
      </div>

      {versies.data?.limietBereikt && (
        <p
          role="alert"
          className="mb-6 rounded-md border border-amber-500/50 bg-amber-500/10 px-3 py-2 text-sm"
        >
          Let op: er zijn meer dan {DASHBOARD_VERSIE_LIMIET.toLocaleString("nl-NL")} opgeslagen
          versies. Alleen de eerste {DASHBOARD_VERSIE_LIMIET.toLocaleString("nl-NL")} zijn
          meegenomen, dus de trend en “al behaald” zijn onvolledig.
        </p>
      )}

      {fout ? (
        <p className="text-destructive">Dashboard laden lukte niet: {fout.message}</p>
      ) : !D ? (
        <p className="text-muted-foreground">Bezig met laden…</p>
      ) : !tellingen.data?.length ? (
        <p className="text-muted-foreground">
          Nog geen tellingen. Zodra er tellingen zijn, verschijnt hier een overzicht.
        </p>
      ) : (
        <DashboardInhoud D={D} isAdmin={rechten.isAdmin} collegaNaam={collegaNaam} />
      )}
    </main>
  );
}

function DashboardInhoud({
  D,
  isAdmin,
  collegaNaam,
}: {
  D: Dashboard;
  isAdmin: boolean;
  collegaNaam: (id: string) => string;
}) {
  const winst = D.nabijGrens.slice().sort((a, b) => (b.totaal ?? 0) - (a.totaal ?? 0));
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tegel waarde={D.totaal} label="Tellingen in de portefeuille" />
        <Tegel
          waarde={D.gemPunten != null ? fmt(D.gemPunten, 1) : "–"}
          label="Gemiddeld aantal punten"
        />
        <Tegel
          waarde={D.vrijeSector.length}
          label={`Al in de vrije sector (vanaf ${D.grensMidden + 1} punten)`}
        />
        <Tegel
          waarde={D.nabijGrens.length}
          label={`Net onder de grens (binnen ${D.marge} punten van ${D.grensMidden})`}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Kaart titel="Verdeling naar segment">
          <SegmentBalk D={D} />
        </Kaart>
        <Kaart titel="Verdeling naar energielabel">
          <LabelVerdeling D={D} />
        </Kaart>
      </div>

      <Kaart titel="Puntenverdeling">
        <Histogram D={D} />
      </Kaart>

      <Kaart titel="Trend: gemiddeld aantal punten over tijd">
        {D.trend.length >= 2 ? (
          <Trend D={D} />
        ) : (
          <p className="text-sm text-muted-foreground">
            Nog niet genoeg versiegeschiedenis (minstens twee verschillende maanden met opgeslagen
            versies nodig) om een trend te tonen.
          </p>
        )}
      </Kaart>

      <Kaart titel="Waarde van de portefeuille">
        <div className="grid gap-3 sm:grid-cols-2">
          <Tegel
            waarde={eur(D.behaaldTotaal)}
            label={
              "Al behaalde huurstijging per maand, door hertellingen" +
              (D.behaaldAantal
                ? " bij " + D.behaaldAantal + " telling" + (D.behaaldAantal > 1 ? "en" : "")
                : "") +
              (D.opgeschoven ? " (waarvan " + D.opgeschoven + " naar een hoger segment)" : "")
            }
          />
          <Tegel
            waarde={eur(D.potentieelTotaal)}
            label={
              "Potentiële huurstijging per maand als de " +
              D.potentieelAantal +
              " telling" +
              (D.potentieelAantal === 1 ? "" : "en") +
              " net onder de grens de vrije sector halen"
            }
          />
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          “Al behaald” vergelijkt de eerste met de laatste opgeslagen versie van elke telling.
          “Potentieel” is een indicatie op basis van de huidige huurprijstabel, geen advies over
          welke maatregelen daarvoor nodig zijn — gebruik daarvoor het verbeteradvies bij de telling
          zelf.
        </p>
      </Kaart>

      <div className="grid gap-6 lg:grid-cols-2">
        <Kaart titel="Energielabels die binnenkort verlopen">
          {D.labelSignalen.length ? (
            <Lijst>
              {D.labelSignalen.map((x) => (
                <TellingRij
                  key={x.t.id}
                  t={x.t}
                  status={
                    x.dagenTot < 0
                      ? "Verlopen op " + datumKort(x.vervalt)
                      : "Verloopt " + datumKort(x.vervalt) + " (over " + x.dagenTot + " dagen)"
                  }
                  waarschuwing={x.dagenTot < 0}
                />
              ))}
            </Lijst>
          ) : (
            <p className="text-sm text-muted-foreground">
              Geen energielabels die binnen een jaar verlopen (of al verlopen zijn) — alleen labels
              met een bekende registratiedatum worden hier gesignaleerd.
            </p>
          )}
        </Kaart>
        <Kaart titel="Snelste winst: bijna in de vrije sector">
          {winst.length ? (
            <>
              <Lijst>
                {winst.slice(0, 5).map((r) => (
                  <TellingRij
                    key={r.t.id}
                    t={r.t}
                    status={
                      r.totaal +
                      " punten · nog " +
                      r.nodig +
                      " nodig voor de vrije sector" +
                      (r.winst != null ? ", +" + eur(r.winst) + " per maand mogelijk" : "")
                    }
                  />
                ))}
              </Lijst>
              {winst.length > 5 && (
                <p className="mt-2 text-xs text-muted-foreground">
                  En {winst.length - 5} andere telling{winst.length - 5 === 1 ? "" : "en"} binnen{" "}
                  {D.marge} punten van de grens.
                </p>
              )}
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              Geen tellingen binnen {D.marge} punten onder de grens.
            </p>
          )}
        </Kaart>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Kaart titel="Recent bijgewerkt">
          {D.recent.length ? (
            <Lijst>
              {D.recent.map((t) => (
                <TellingRij
                  key={t.id}
                  t={t}
                  status={
                    collegaNaam(t.ownerId) +
                    " · " +
                    new Date(t.updatedAt).toLocaleString("nl-NL", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })
                  }
                />
              ))}
            </Lijst>
          ) : (
            <p className="text-sm text-muted-foreground">Nog geen tellingen bijgewerkt.</p>
          )}
        </Kaart>
        {isAdmin && D.perCollega.length > 1 && (
          <Kaart titel="Werkverdeling per collega">
            <Lijst>
              {D.perCollega.map((c) => (
                <li key={c.ownerId} className="flex justify-between gap-3 px-3 py-2 text-sm">
                  <span className="font-medium">{collegaNaam(c.ownerId)}</span>
                  <span className="text-muted-foreground">
                    {c.aantal} telling{c.aantal === 1 ? "" : "en"}
                    {c.gemPunten != null && " · gem. " + fmt(c.gemPunten, 1) + " punten"}
                  </span>
                </li>
              ))}
            </Lijst>
          </Kaart>
        )}
      </div>
    </div>
  );
}

// ---------- bouwstenen ----------

function Tegel({ waarde, label }: { waarde: ReactNode; label: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="text-2xl font-semibold tabular-nums">{waarde}</div>
      <div className="mt-1 text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

function Kaart({ titel, children }: { titel: string; children: ReactNode }) {
  return (
    <section className="rounded-lg border border-border bg-card p-4" aria-label={titel}>
      <h2 className="mb-3 text-sm font-semibold">{titel}</h2>
      {children}
    </section>
  );
}

function Lijst({ children }: { children: ReactNode }) {
  return <ul className="divide-y divide-border rounded-md border border-border">{children}</ul>;
}

function TellingRij({
  t,
  status,
  waarschuwing = false,
}: {
  t: Telling;
  status: string;
  waarschuwing?: boolean;
}) {
  return (
    <li>
      <Link
        to="/wws"
        search={{ id: t.id }}
        className="flex flex-wrap justify-between gap-x-3 gap-y-0.5 px-3 py-2 text-sm hover:bg-muted"
      >
        <span className="font-medium">{tellingTitel(t.meta)}</span>
        <span className={waarschuwing ? "text-destructive" : "text-muted-foreground"}>
          {status}
        </span>
      </Link>
    </li>
  );
}

/** Segmenten zijn geordend (laag → hoog): één tint, licht naar donker, met labels erbij */
const SEG_OPACITY = { laag: 0.35, midden: 0.65, hoog: 1 } as const;

function SegmentBalk({ D }: { D: Dashboard }) {
  const delen = [
    { k: "laag" as const, n: D.segLaag.length, label: `Sociale huur (t/m ${D.grensLaag} punten)` },
    {
      k: "midden" as const,
      n: D.segMidden.length,
      label: `Middenhuur (${D.grensLaag + 1}–${D.grensMidden} punten)`,
    },
    {
      k: "hoog" as const,
      n: D.segHoog.length,
      label: `Vrije sector (vanaf ${D.grensMidden + 1} punten)`,
    },
  ];
  const totaal = delen.reduce((s, d) => s + d.n, 0);
  if (!totaal)
    return <p className="text-sm text-muted-foreground">Nog geen tellingen met punten.</p>;
  const pct = (n: number) => Math.round((n / totaal) * 1000) / 10;
  return (
    <div>
      <div
        className="flex h-4 gap-0.5 overflow-hidden rounded"
        role="img"
        aria-label="Verdeling naar segment"
      >
        {delen
          .filter((d) => d.n > 0)
          .map((d) => (
            <div
              key={d.k}
              className="h-full bg-primary"
              style={{ width: pct(d.n) + "%", opacity: SEG_OPACITY[d.k] }}
              title={`${d.label}: ${d.n} (${pct(d.n)}%)`}
            />
          ))}
      </div>
      <ul className="mt-3 space-y-1 text-sm">
        {delen.map((d) => (
          <li key={d.k} className="flex items-center gap-2">
            <span
              className="inline-block size-3 rounded-sm bg-primary"
              style={{ opacity: SEG_OPACITY[d.k] }}
            />
            <span className="flex-1">{d.label}</span>
            <span className="tabular-nums">
              <b>{d.n}</b> ({pct(d.n)}%)
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function LabelVerdeling({ D }: { D: Dashboard }) {
  const totaal = D.labelCounts.reduce((s, d) => s + d.n, 0);
  if (!totaal)
    return (
      <p className="text-sm text-muted-foreground">
        Nog geen tellingen met een bekend energielabel (A t/m G).
      </p>
    );
  const max = Math.max(1, ...D.labelCounts.map((d) => d.n));
  return (
    <ul className="space-y-1 text-sm">
      {D.labelCounts.map((d) => (
        <li key={d.label} className="flex items-center gap-2" title={`${d.label}: ${d.n}`}>
          <span className="w-12 tabular-nums">{d.label}</span>
          <span className="h-3 flex-1 rounded bg-muted">
            {d.n > 0 && (
              <span
                className="block h-3 rounded bg-primary"
                style={{ width: Math.max((d.n / max) * 100, 4) + "%" }}
              />
            )}
          </span>
          <span className="w-20 text-right tabular-nums text-muted-foreground">
            {d.n ? `${d.n} (${Math.round((d.n / totaal) * 1000) / 10}%)` : "0"}
          </span>
        </li>
      ))}
    </ul>
  );
}

const W = 720,
  H = 170;

function Histogram({ D }: { D: Dashboard }) {
  const emmers = histogram(D.alleTotalen, D.grensMidden);
  if (!emmers.length) return null;
  const padL = 6,
    padR = 6,
    padB = 22,
    padT = 20;
  const plotW = W - padL - padR,
    plotH = H - padT - padB;
  const step = plotW / emmers.length;
  const bw = Math.max(4, Math.min(28, step - 4));
  const maxN = Math.max(1, ...emmers.map((e) => e.n));
  const elke = emmers.length > 14 ? 3 : emmers.length > 8 ? 2 : 1;
  const grensX = padL + Math.min(plotW, ((D.grensMidden + 1) / 20) * step);
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="h-auto w-full"
      role="img"
      aria-label="Verdeling van het aantal WWS-punten over de portefeuille, met de vrije-sectorgrens"
    >
      <line
        x1={padL}
        x2={padL + plotW}
        y1={padT + plotH}
        y2={padT + plotH}
        className="stroke-border"
      />
      {emmers.map((e, i) => {
        if (!e.n) return null;
        const x = padL + i * step + (step - bw) / 2;
        const h = Math.max((e.n / maxN) * plotH, 2);
        const y = padT + plotH - h;
        return (
          <g key={i}>
            <rect x={x} y={y} width={bw} height={h} rx={4} className="fill-primary">
              <title>{`${e.van}–${e.van + 19} punten: ${e.n} telling${e.n === 1 ? "" : "en"}`}</title>
            </rect>
            <text
              x={x + bw / 2}
              y={y - 5}
              textAnchor="middle"
              className="fill-muted-foreground text-[11px]"
            >
              {e.n}
            </text>
          </g>
        );
      })}
      <line
        x1={grensX}
        x2={grensX}
        y1={padT}
        y2={padT + plotH}
        className="stroke-foreground"
        strokeDasharray="4 3"
      />
      <text x={grensX} y={padT - 6} textAnchor="middle" className="fill-foreground text-[11px]">
        grens {D.grensMidden + 1}
      </text>
      {emmers.map((e, i) =>
        i % elke === 0 ? (
          <text
            key={i}
            x={padL + i * step + step / 2}
            y={H - 6}
            textAnchor="middle"
            className="fill-muted-foreground text-[11px]"
          >
            {e.van}
          </text>
        ) : null,
      )}
    </svg>
  );
}

function Trend({ D }: { D: Dashboard }) {
  const data = D.trend;
  const padL = 10,
    padR = 16,
    padB = 24,
    padT = 24;
  const plotW = W - padL - padR,
    plotH = H - padT - padB;
  let lo = Math.min(...data.map((d) => d.gem)),
    hi = Math.max(...data.map((d) => d.gem));
  if (hi - lo < 10) {
    const mid = (hi + lo) / 2;
    lo = mid - 5;
    hi = mid + 5;
  }
  const pad = (hi - lo) * 0.15;
  lo -= pad;
  hi += pad;
  const x = (i: number) => padL + (i / (data.length - 1)) * plotW;
  const y = (v: number) => padT + plotH - ((v - lo) / (hi - lo)) * plotH;
  const laatste = data[data.length - 1]!;
  const grensZichtbaar = D.grensMidden >= lo && D.grensMidden <= hi;
  const elke = data.length > 10 ? Math.ceil(data.length / 8) : 1;
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="h-auto w-full"
      role="img"
      aria-label="Gemiddeld aantal WWS-punten per maand, over tijd"
    >
      <line
        x1={padL}
        x2={padL + plotW}
        y1={padT + plotH}
        y2={padT + plotH}
        className="stroke-border"
      />
      {grensZichtbaar && (
        <>
          <line
            x1={padL}
            x2={padL + plotW}
            y1={y(D.grensMidden)}
            y2={y(D.grensMidden)}
            className="stroke-foreground"
            strokeDasharray="4 3"
          />
          <text x={padL} y={y(D.grensMidden) - 4} className="fill-foreground text-[11px]">
            grens {D.grensMidden}
          </text>
        </>
      )}
      <polyline
        points={data.map((d, i) => `${x(i).toFixed(1)},${y(d.gem).toFixed(1)}`).join(" ")}
        fill="none"
        strokeWidth={2}
        className="stroke-primary"
      />
      {data.map((d, i) => (
        <circle
          key={d.key}
          cx={x(i)}
          cy={y(d.gem)}
          r={i === data.length - 1 ? 4 : 8}
          className={i === data.length - 1 ? "fill-primary" : "fill-transparent"}
        >
          <title>{`${d.label}: gemiddeld ${fmt(d.gem, 1)} punten`}</title>
        </circle>
      ))}
      <text
        x={x(data.length - 1)}
        y={y(laatste.gem) - 10}
        textAnchor="end"
        className="fill-foreground text-[11px] font-medium"
      >
        {fmt(laatste.gem, 1)}
      </text>
      {data.map((d, i) =>
        i % elke === 0 || i === data.length - 1 ? (
          <text
            key={d.key}
            x={x(i)}
            y={H - 6}
            textAnchor="middle"
            className="fill-muted-foreground text-[11px]"
          >
            {d.label}
          </text>
        ) : null,
      )}
    </svg>
  );
}
