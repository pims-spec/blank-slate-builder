import { useMemo, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { magTellingBewerken, type Rechten } from "@/lib/rollen";
import { SEGMENT_NAMEN } from "@/lib/wws";
import {
  LEGE_FILTERS,
  archiefRij,
  collegasInLijst,
  groepeerPerCollega,
  heeftFilters,
  matchFilters,
  matchZoek,
  sorteerFavNaam,
  versieKeuzes,
  versiesTekst,
  type ArchiefFilters,
  type ArchiefRij,
} from "@/lib/wws/archief";
import { useNormen } from "./NormenContext";
import { maakArchiefExcel } from "@/lib/wws/excel";
import type { Telling } from "@/lib/wws/opslag";
import DelenDialoog from "./DelenDialoog";
import { dashboardVersiesQuery, klantenQuery, tellingStore, tellingenQuery } from "./tellingStore";
import { useDownload } from "./useDownload";

const datumTijd = (iso: string) =>
  new Date(iso).toLocaleString("nl-NL", { dateStyle: "medium", timeStyle: "short" });

const veldCls =
  "h-9 rounded-lg border border-transparent bg-muted px-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring";

interface Props {
  rechten: Rechten;
  userId: string;
  /** "Bestaande telling kiezen" voor het indelingsadvies (indelingNaOpenen in de bron) */
  voorIndeling?: boolean;
  /** Tabbladen (Tellingen / Portefeuille-analyses) onder de titel */
  tabs?: ReactNode;
}

/** Archief: zoeken, filteren, per collega groeperen, openen en verwijderen — renderArchief() */
export default function Archief({ rechten, userId, voorIndeling = false, tabs }: Props) {
  const queryClient = useQueryClient();
  const NORMEN = useNormen();
  const { data, isPending, error } = useQuery(tellingenQuery());
  const { data: klanten = [] } = useQuery(klantenQuery());
  const [zoek, setZoek] = useState("");
  const [filters, setFilters] = useState<ArchiefFilters>(LEGE_FILTERS);
  const [teVerwijderen, setTeVerwijderen] = useState<ArchiefRij | null>(null);
  /** Telling waarvan het deelvenster open staat */
  const [teDelen, setTeDelen] = useState<ArchiefRij | null>(null);
  // namen en nummers van de versies (dezelfde lichte query als het dashboard)
  const { data: versieData } = useQuery(dashboardVersiesQuery());
  /** Per telling de gekozen versie om te openen ("" = werkversie) */
  const [gekozen, setGekozen] = useState<Record<string, string>>({});
  const download = useDownload();

  const rijen = useMemo(
    () => (data ?? []).map((t) => archiefRij(t, NORMEN, klanten)),
    [data, NORMEN, klanten],
  );
  const zichtbaar = useMemo(
    // favorieten eerst, dan op naam — zoals de bron
    () => sorteerFavNaam(rijen.filter((r) => matchZoek(r, zoek) && matchFilters(r, filters))),
    [rijen, zoek, filters],
  );
  const collegas = useMemo(() => collegasInLijst(rijen), [rijen]);
  // Collega-kolom en -filter: voor admin/kijkrol, of zodra er tellingen van anderen tussen zitten
  const toonCollega = rechten.zietAlles || rijen.some((r) => r.t.ownerId !== userId);
  const groeperen = rechten.zietAlles && !filters.collega;

  const zet = <K extends keyof ArchiefFilters>(k: K, v: ArchiefFilters[K]) =>
    setFilters((f) => ({ ...f, [k]: v }));

  const verwijder = useMutation({
    mutationFn: (id: string) => tellingStore.verwijder(id),
    onSuccess: () => {
      toast.success("Telling verwijderd");
      void queryClient.invalidateQueries({ queryKey: ["tellingen"] });
    },
    onError: (e) => toast.error("Verwijderen lukte niet: " + e.message),
  });

  /** Favoriet aan/uit, meteen opgeslagen — toggleFavoriet() */
  const favoriet = useMutation({
    mutationFn: ({ t, aan }: { t: Telling; aan: boolean }) => tellingStore.zetFavoriet(t, aan),
    onMutate: ({ t, aan }) => {
      queryClient.setQueryData<Telling[]>(["tellingen"], (lijst) =>
        lijst?.map((x) => (x.id === t.id ? { ...x, meta: { ...x.meta, favoriet: aan } } : x)),
      );
    },
    onError: (e) => toast.error("Opslaan lukte niet: " + e.message),
    onSettled: () => void queryClient.invalidateQueries({ queryKey: ["tellingen"] }),
  });

  const rij = (r: ArchiefRij) => {
    const gedeeld = r.t.ownerId !== userId && !rechten.zietAlles;
    const keuzes = versieKeuzes(r.t.id, versieData?.versies ?? []);
    const versie = gekozen[r.t.id] ?? "";
    const openZoek = {
      id: r.t.id,
      ...(voorIndeling ? { indeling: true } : {}),
      ...(versie ? { versie: Number(versie) } : {}),
    };
    const fav = !!r.t.meta["favoriet"];
    const magFav = magTellingBewerken(rechten, r.t.ownerId, userId);
    return (
      <tr key={r.t.id} className="border-t border-border align-top">
        <td className="w-8 py-1.5 pl-2">
          <button
            type="button"
            className={`text-lg leading-none ${fav ? "text-amber-500" : "text-muted-foreground"} disabled:opacity-40`}
            aria-pressed={fav}
            aria-label={(fav ? "Favoriet verwijderen: " : "Markeren als favoriet: ") + r.titel}
            title={fav ? "Favoriet verwijderen" : "Markeren als favoriet"}
            disabled={!magFav}
            onClick={() => favoriet.mutate({ t: r.t, aan: !fav })}
          >
            {fav ? "★" : "☆"}
          </button>
        </td>
        <td className="px-3 py-2">
          <Link
            to="/wws"
            search={voorIndeling ? { id: r.t.id, indeling: true } : { id: r.t.id }}
            className="font-medium hover:underline"
          >
            {r.titel}
          </Link>
          {r.adres && <div className="text-xs text-muted-foreground">{r.adres}</div>}
          {gedeeld && (
            <div className="text-xs text-muted-foreground">gedeeld door {r.collega || "?"}</div>
          )}
        </td>
        <td className="px-3 py-2">{r.eigenaar || "—"}</td>
        {toonCollega && !groeperen && <td className="px-3 py-2">{r.collega || "—"}</td>}
        <td className="px-3 py-2 text-right tabular-nums">{r.punten ?? "—"}</td>
        <td className="px-3 py-2">{r.seg ? SEGMENT_NAMEN[r.seg] : "—"}</td>
        <td className="px-3 py-2 text-muted-foreground">{datumTijd(r.t.gewijzigdOp)}</td>
        <td className="px-3 py-2">
          <div className="whitespace-nowrap text-muted-foreground">{versiesTekst(r.t)}</div>
          {/* meerdere versies: kiezen welke er geopend wordt (aanvulling op de bron) */}
          {keuzes.length > 2 && (
            <select
              className={veldCls + " mt-1 h-8 max-w-48 text-xs"}
              aria-label={"Te openen versie: " + r.titel}
              value={versie}
              onChange={(e) => setGekozen((g) => ({ ...g, [r.t.id]: e.target.value }))}
            >
              {keuzes.map((k) => (
                <option key={k.waarde} value={k.waarde}>
                  {k.label}
                </option>
              ))}
            </select>
          )}
        </td>
        <td className="whitespace-nowrap px-3 py-1 text-right">
          <Button asChild size="sm" variant="ghost">
            <Link to="/wws" search={openZoek}>
              Openen
            </Link>
          </Button>
          {magTellingBewerken(rechten, r.t.ownerId, userId) && (
            <Button size="sm" variant="ghost" onClick={() => setTeDelen(r)}>
              Delen
            </Button>
          )}
          {magTellingBewerken(rechten, r.t.ownerId, userId) && (
            <Button
              size="sm"
              variant="ghost"
              className="text-destructive hover:text-destructive"
              onClick={() => setTeVerwijderen(r)}
            >
              Verwijderen
            </Button>
          )}
        </td>
      </tr>
    );
  };

  const kolommen = 8 + (toonCollega && !groeperen ? 1 : 0);

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-[34px] leading-tight text-foreground max-[720px]:text-[28px]">
            Archief
          </h1>
          {!voorIndeling && tabs}
          {voorIndeling && (
            <p className="mt-2 rounded-md border border-primary/40 bg-primary/5 px-3 py-2 text-sm">
              Kies een telling om het indelingsadvies voor te openen.{" "}
              <Link to="/archief" className="underline">
                Gewoon het archief
              </Link>
            </p>
          )}
          <p className="mt-1 text-sm text-muted-foreground">
            {rechten.zietAlles
              ? "Alle tellingen van jou en je collega's."
              : "Je eigen tellingen en tellingen die met je gedeeld zijn."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Input
            aria-label="Zoeken"
            placeholder="Zoek op naam, adres, postcode of eigenaar"
            value={zoek}
            onChange={(e) => setZoek(e.target.value)}
            className="w-full bg-card sm:w-72"
          />
          <Button
            variant="outline"
            disabled={!!download.bezig || !data}
            onClick={() =>
              download.excel("excel", (XLSX) =>
                // de tellingen die nu (met zoekopdracht en filters) zichtbaar zijn
                maakArchiefExcel(
                  XLSX,
                  zichtbaar.map((r) => r.t),
                  NORMEN,
                  {
                    klantNaam: (id) => (id ? (klanten.find((k) => k.id === id)?.naam ?? "") : ""),
                    collegaNaam: (t) => t.ownerNaam || "Onbekende gebruiker",
                  },
                ),
              )
            }
          >
            {download.bezig ? "Exporteren…" : "Exporteren (.xlsx)"}
          </Button>
          {rechten.magSchrijven && (
            <Button asChild>
              <Link to="/wws">Nieuwe telling</Link>
            </Button>
          )}
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-end gap-3 text-sm" aria-label="Filters">
        <Filter label="Eigenaar">
          <select
            className={veldCls + " bg-card!"}
            value={filters.eigenaar}
            onChange={(e) => zet("eigenaar", e.target.value)}
          >
            <option value="">Alle eigenaren</option>
            {klanten.map((k) => (
              <option key={k.id} value={k.id}>
                {k.naam}
              </option>
            ))}
          </select>
        </Filter>
        {toonCollega && (
          <Filter label="Collega">
            <select
              className={veldCls + " bg-card!"}
              value={filters.collega}
              onChange={(e) => zet("collega", e.target.value)}
            >
              <option value="">Alle collega's</option>
              {collegas.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.naam}
                </option>
              ))}
            </select>
          </Filter>
        )}
        <Filter label="Segment">
          <select
            className={veldCls + " bg-card!"}
            value={filters.segment}
            onChange={(e) => zet("segment", e.target.value as ArchiefFilters["segment"])}
          >
            <option value="">Alle segmenten</option>
            {(["laag", "midden", "hoog"] as const).map((s) => (
              <option key={s} value={s}>
                {SEGMENT_NAMEN[s]}
              </option>
            ))}
          </select>
        </Filter>
        <Filter label="Woningtype">
          <select
            className={veldCls + " bg-card!"}
            value={filters.woningtype}
            onChange={(e) => zet("woningtype", e.target.value as ArchiefFilters["woningtype"])}
          >
            <option value="">Alle woningtypes</option>
            <option value="eengezins">Eengezinswoning</option>
            <option value="meergezins">Meergezinswoning</option>
          </select>
        </Filter>
        <Filter label="Punten van">
          <Input
            inputMode="numeric"
            className="w-20 bg-card"
            value={filters.puntenVan}
            onChange={(e) => zet("puntenVan", e.target.value)}
          />
        </Filter>
        <Filter label="tot en met">
          <Input
            inputMode="numeric"
            className="w-20 bg-card"
            value={filters.puntenTot}
            onChange={(e) => zet("puntenTot", e.target.value)}
          />
        </Filter>
        <Filter label="Peildatum van">
          <Input
            type="date"
            className="bg-card"
            value={filters.peilVan}
            onChange={(e) => zet("peilVan", e.target.value)}
          />
        </Filter>
        <Filter label="tot en met">
          <Input
            type="date"
            className="bg-card"
            value={filters.peilTot}
            onChange={(e) => zet("peilTot", e.target.value)}
          />
        </Filter>
        {heeftFilters(filters) && (
          <Button variant="ghost" size="sm" onClick={() => setFilters(LEGE_FILTERS)}>
            Filters wissen
          </Button>
        )}
      </div>

      {isPending ? (
        <p className="text-muted-foreground">Tellingen laden…</p>
      ) : error ? (
        <p className="text-destructive">Tellingen laden lukte niet: {error.message}</p>
      ) : rijen.length === 0 ? (
        <p className="text-muted-foreground">
          Nog geen tellingen.{rechten.magSchrijven && " Start met een nieuwe telling."}
        </p>
      ) : zichtbaar.length === 0 ? (
        <p className="text-muted-foreground">
          Niets gevonden{zoek.trim() && <> voor ‘{zoek}’</>} met deze zoekopdracht of filters.
        </p>
      ) : (
        <div className="overflow-x-auto gh-card">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-muted-foreground">
              <tr>
                <th className="w-8 pl-2">
                  <span className="sr-only">Favoriet</span>
                </th>
                <th className="px-3 py-2 font-medium">Naam / adres</th>
                <th className="px-3 py-2 font-medium">Eigenaar</th>
                {toonCollega && !groeperen && <th className="px-3 py-2 font-medium">Collega</th>}
                <th className="px-3 py-2 text-right font-medium">Punten</th>
                <th className="px-3 py-2 font-medium">Segment</th>
                <th className="px-3 py-2 font-medium">Laatst gewijzigd</th>
                <th className="px-3 py-2 font-medium">Versies</th>
                <th className="px-3 py-2">
                  <span className="sr-only">Acties</span>
                </th>
              </tr>
            </thead>
            {groeperen ? (
              groepeerPerCollega(zichtbaar).map((g) => (
                <tbody key={g.ownerId}>
                  <tr className="border-t border-border bg-muted/30">
                    <th colSpan={kolommen} scope="colgroup" className="px-3 py-1.5 text-left">
                      {g.naam}{" "}
                      <span className="font-normal text-muted-foreground">({g.rijen.length})</span>
                    </th>
                  </tr>
                  {g.rijen.map(rij)}
                </tbody>
              ))
            ) : (
              <tbody>{zichtbaar.map(rij)}</tbody>
            )}
          </table>
        </div>
      )}

      {teDelen && (
        <DelenDialoog
          open
          onOpenChange={(o) => !o && setTeDelen(null)}
          tellingId={teDelen.t.id}
          ownerId={teDelen.t.ownerId}
          userId={userId}
          isAdmin={rechten.isAdmin}
        />
      )}

      <AlertDialog open={teVerwijderen !== null} onOpenChange={(o) => !o && setTeVerwijderen(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Telling verwijderen?</AlertDialogTitle>
            <AlertDialogDescription>
              ‘{teVerwijderen?.titel}’
              {teVerwijderen && teVerwijderen.t.aantalVersies > 0
                ? teVerwijderen.t.aantalVersies === 1
                  ? " en de opgeslagen versie"
                  : ` en alle ${teVerwijderen.t.aantalVersies} opgeslagen versies`
                : ""}{" "}
              {teVerwijderen && teVerwijderen.t.aantalVersies > 0 ? "worden" : "wordt"} definitief
              verwijderd. Dit kan niet ongedaan worden gemaakt.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuleren</AlertDialogCancel>
            <AlertDialogAction
              className="bg-orange text-orange-foreground shadow-none hover:brightness-105"
              onClick={() => teVerwijderen && verwijder.mutate(teVerwijderen.t.id)}
            >
              Verwijderen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}

function Filter({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}
