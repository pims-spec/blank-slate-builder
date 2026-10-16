// BAG-gegevens voor de verduurzamingsraming: gebruiksoppervlakte, gebruiksdoel en bouwjaar per
// adres, via de openbare PDOK BAG OGC API (geen sleutel). Het antwoord is onbetrouwbare data: zod
// laat alleen de bekende velden door, en een pand-link moet naar dezelfde API wijzen. Fouten
// krijgen een eigen code; de melding van PDOK wordt nooit doorgegeven of gelogd.
import * as z from "zod";

export const BAG_URL = "https://api.pdok.nl/kadaster/bag/ogc/v2/collections";
const PAND_PREFIX = BAG_URL + "/pand/items/";
const TIMEOUT_MS = 10_000;

export type BagStatus = "gevonden" | "niet_gevonden" | "meerdere" | "fout";
export type BagStop = "te_veel_verzoeken" | "dienst_onbereikbaar";

export interface BagResultaat {
  status: BagStatus;
  oppervlakte: number | null;
  bouwjaar: number | null;
  gebruiksdoel: string | null;
}

export interface BagVraag {
  id: string;
  postcode: string;
  huisnummer: number;
  huisletter: string;
  toevoeging: string;
}

const Tekst = z.string().max(200).nullish();
const VboSchema = z.object({
  features: z
    .array(
      z.object({
        properties: z.object({
          oppervlakte: z.number().int().min(1).max(100000).nullish(),
          gebruiksdoel: Tekst,
          huisletter: Tekst,
          toevoeging: Tekst,
          "pand.href": z.array(z.string().max(300)).max(20).nullish(),
        }),
      }),
    )
    .max(100),
});
const PandSchema = z.object({
  properties: z.object({ bouwjaar: z.number().int().min(1000).max(2100).nullish() }),
});

/** Alle verblijfsobjecten op postcode + huisnummer; huisletter en toevoeging kiezen we zelf */
export function vboUrl(postcode: string, huisnummer: number): string {
  return (
    BAG_URL +
    "/verblijfsobject/items?" +
    new URLSearchParams({ f: "json", postcode, huisnummer: String(huisnummer), limit: "100" })
  );
}

const gelijk = (a: string | null | undefined, b: string) =>
  (a ?? "").trim().toUpperCase() === b.trim().toUpperCase();

type Antwoord = { ok: true; json: unknown } | { ok: false; stop: BagStop } | { ok: false };

/** Alleen onze code en de HTTP-status loggen, nooit de URL (die bevat het adres) of de body */
const log = (code: string, status?: number) =>
  console.warn(`[bag] ${code}${status ? ` (HTTP ${status})` : ""}`);

async function haal(fetchFn: typeof fetch, url: string): Promise<Antwoord> {
  let res: Response;
  try {
    res = await fetchFn(url, {
      headers: { Accept: "application/json" },
      // geen doorverwijzingen volgen; "error" kent Cloudflare Workers niet, dus "manual"
      redirect: "manual",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (e) {
    log(e instanceof Error && e.name === "TimeoutError" ? "time-out" : "geen_verbinding");
    return { ok: false, stop: "dienst_onbereikbaar" };
  }
  if (res.status === 429) {
    log("te_veel_verzoeken", 429);
    return { ok: false, stop: "te_veel_verzoeken" };
  }
  if (res.status >= 500) {
    log("dienst_onbereikbaar", res.status);
    return { ok: false, stop: "dienst_onbereikbaar" };
  }
  if (!res.ok) {
    if (res.status !== 404) log("fout", res.status);
    return { ok: false };
  }
  try {
    return { ok: true, json: await res.json() };
  } catch {
    log("geen_json", res.status);
    return { ok: false };
  }
}

const leeg = (status: BagStatus): BagResultaat => ({
  status,
  oppervlakte: null,
  bouwjaar: null,
  gebruiksdoel: null,
});

/**
 * BAG-gegevens voor een portie adressen. Per postcode + huisnummer één vraag; het bouwjaar per pand
 * één keer (veel woningen delen een pand). Wacht `wacht` ms vóór elke aanvraag. Stopt bij te veel
 * verzoeken of een storing; wat al binnen is komt mee.
 */
export async function haalBagPortie(
  fetchFn: typeof fetch,
  wacht: number,
  adressen: readonly BagVraag[],
  slaapFn: (ms: number) => Promise<unknown>,
): Promise<{ resultaten: { id: string; resultaat: BagResultaat }[]; stop?: BagStop }> {
  const resultaten: { id: string; resultaat: BagResultaat }[] = [];
  const perNummer = new Map<string, BagVraag[]>();
  for (const a of adressen) {
    const k = a.postcode + "|" + a.huisnummer;
    perNummer.set(k, [...(perNummer.get(k) ?? []), a]);
  }
  const bouwjaren = new Map<string, number | null>();

  for (const groep of perNummer.values()) {
    const { postcode, huisnummer } = groep[0]!;
    await slaapFn(wacht);
    const r = await haal(fetchFn, vboUrl(postcode, huisnummer));
    if (!r.ok) {
      if ("stop" in r) return { resultaten, stop: r.stop };
      for (const a of groep) resultaten.push({ id: a.id, resultaat: leeg("fout") });
      continue;
    }
    const v = VboSchema.safeParse(r.json);
    if (!v.success) {
      for (const a of groep) resultaten.push({ id: a.id, resultaat: leeg("fout") });
      continue;
    }
    for (const a of groep) {
      const treffers = v.data.features.filter(
        (f) =>
          gelijk(f.properties.huisletter, a.huisletter) &&
          gelijk(f.properties.toevoeging, a.toevoeging),
      );
      if (!treffers.length) {
        resultaten.push({ id: a.id, resultaat: leeg("niet_gevonden") });
        continue;
      }
      if (treffers.length > 1) {
        resultaten.push({ id: a.id, resultaat: leeg("meerdere") });
        continue;
      }
      const p = treffers[0]!.properties;
      // bouwjaar: van het oudste pand (een woning in meer panden is zeldzaam)
      let bouwjaar: number | null = null;
      for (const href of (p["pand.href"] ?? []).filter((h) => h.startsWith(PAND_PREFIX))) {
        if (!bouwjaren.has(href)) {
          await slaapFn(wacht);
          const pr = await haal(fetchFn, href.split("?")[0] + "?f=json");
          if (!pr.ok) {
            if ("stop" in pr) return { resultaten, stop: pr.stop };
            bouwjaren.set(href, null);
          } else {
            const pd = PandSchema.safeParse(pr.json);
            bouwjaren.set(href, pd.success ? (pd.data.properties.bouwjaar ?? null) : null);
          }
        }
        const j = bouwjaren.get(href) ?? null;
        if (j !== null && (bouwjaar === null || j < bouwjaar)) bouwjaar = j;
      }
      resultaten.push({
        id: a.id,
        resultaat: {
          status: "gevonden",
          oppervlakte: p.oppervlakte ?? null,
          bouwjaar,
          gebruiksdoel: p.gebruiksdoel?.trim().slice(0, 200) || null,
        },
      });
    }
  }
  return { resultaten };
}
