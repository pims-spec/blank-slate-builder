// BAG-gegevens voor de verduurzamingsraming: gebruiksoppervlakte, gebruiksdoel en bouwjaar per
// adres, via openbare PDOK-diensten (geen sleutel). Snel in drie stappen, elk ca. 0,1 s:
//   1. Locatieserver: het BAG-id van het verblijfsobject bij postcode + huisnummer (+ letter/toev.);
//   2. BAG OGC API: dat verblijfsobject op id (oppervlakte, gebruiksdoel, pand);
//   3. BAG OGC API: het pand (bouwjaar), één keer per pand.
// (Zoeken op postcode + huisnummer in de BAG OGC API zelf duurt 5–11 s per vraag.)
// Antwoorden zijn onbetrouwbare data: zod laat alleen de bekende velden door, een id moet uit
// cijfers bestaan en een pand-link moet naar dezelfde API wijzen. Fouten krijgen een eigen code;
// de melding van PDOK wordt nooit doorgegeven of gelogd.
import * as z from "zod";

export const BAG_URL = "https://api.pdok.nl/kadaster/bag/ogc/v2/collections";
export const LOCATIESERVER_URL = "https://api.pdok.nl/bzk/locatieserver/search/v3_1/free";
const PAND_PREFIX = BAG_URL + "/pand/items/";
const TIMEOUT_MS = 15_000;

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
const VboId = z.string().regex(/^\d{16}$/);
const ZoekSchema = z.object({
  response: z.object({
    docs: z
      .array(
        z.object({
          adresseerbaarobject_id: VboId.optional(),
          huisletter: Tekst,
          huisnummertoevoeging: Tekst,
        }),
      )
      .max(100),
  }),
});
const VboSchema = z.object({
  features: z
    .array(
      z.object({
        properties: z.object({
          oppervlakte: z.number().int().min(1).max(100000).nullish(),
          gebruiksdoel: Tekst,
          "pand.href": z.array(z.string().max(300)).max(20).nullish(),
        }),
      }),
    )
    .max(5),
});
const PandSchema = z.object({
  properties: z.object({ bouwjaar: z.number().int().min(1000).max(2100).nullish() }),
});

/** Locatieserver: alle adressen op postcode + huisnummer (letter en toevoeging kiezen we zelf) */
export function zoekUrl(postcode: string, huisnummer: number): string {
  return (
    LOCATIESERVER_URL +
    "?" +
    new URLSearchParams({
      q: `postcode:${postcode} and huisnummer:${huisnummer} and type:adres`,
      rows: "100",
      fl: "adresseerbaarobject_id,huisletter,huisnummertoevoeging",
    })
  );
}

/** BAG OGC API: één verblijfsobject op zijn id */
export function vboUrl(vboId: string): string {
  return (
    BAG_URL + "/verblijfsobject/items?" + new URLSearchParams({ f: "json", identificatie: vboId })
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

type Stap<T> = { ok: true; waarde: T } | { ok: false; stop?: BagStop };

/**
 * BAG-gegevens voor een portie adressen. Per postcode + huisnummer één zoekvraag, per woning één
 * vraag op id, en het bouwjaar per pand één keer (veel woningen delen een pand). Wacht `wacht` ms
 * vóór elke aanvraag. Stopt bij te veel verzoeken of een storing; wat al binnen is komt mee.
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

  async function vraag<T>(url: string, lees: (json: unknown) => T | null): Promise<Stap<T>> {
    await slaapFn(wacht);
    const r = await haal(fetchFn, url);
    if (!r.ok) return "stop" in r ? { ok: false, stop: r.stop } : { ok: false };
    const w = lees(r.json);
    return w === null ? { ok: false } : { ok: true, waarde: w };
  }

  for (const groep of perNummer.values()) {
    const { postcode, huisnummer } = groep[0]!;
    const zoek = await vraag(zoekUrl(postcode, huisnummer), (j) => {
      const z = ZoekSchema.safeParse(j);
      return z.success ? z.data.response.docs : null;
    });
    if (!zoek.ok) {
      if (zoek.stop) return { resultaten, stop: zoek.stop };
      for (const a of groep) resultaten.push({ id: a.id, resultaat: leeg("fout") });
      continue;
    }

    for (const a of groep) {
      const ids = [
        ...new Set(
          zoek.waarde
            .filter(
              (d) =>
                d.adresseerbaarobject_id &&
                gelijk(d.huisletter, a.huisletter) &&
                gelijk(d.huisnummertoevoeging, a.toevoeging),
            )
            .map((d) => d.adresseerbaarobject_id!),
        ),
      ];
      if (!ids.length) {
        resultaten.push({ id: a.id, resultaat: leeg("niet_gevonden") });
        continue;
      }
      if (ids.length > 1) {
        resultaten.push({ id: a.id, resultaat: leeg("meerdere") });
        continue;
      }

      const vbo = await vraag(vboUrl(ids[0]!), (j) => {
        const v = VboSchema.safeParse(j);
        return v.success && v.data.features[0] ? v.data.features[0].properties : null;
      });
      if (!vbo.ok) {
        if (vbo.stop) return { resultaten, stop: vbo.stop };
        resultaten.push({ id: a.id, resultaat: leeg("fout") });
        continue;
      }
      const p = vbo.waarde;

      // bouwjaar: van het oudste pand (een woning in meer panden is zeldzaam)
      let bouwjaar: number | null = null;
      for (const href of (p["pand.href"] ?? []).filter((h) => h.startsWith(PAND_PREFIX))) {
        if (!bouwjaren.has(href)) {
          const pand = await vraag(href.split("?")[0] + "?f=json", (j) => {
            const d = PandSchema.safeParse(j);
            return d.success ? { bouwjaar: d.data.properties.bouwjaar ?? null } : null;
          });
          if (!pand.ok && pand.stop) return { resultaten, stop: pand.stop };
          bouwjaren.set(href, pand.ok ? pand.waarde.bouwjaar : null);
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

/**
 * Eén verblijfsobject op id (huurprijsindicator): oppervlakte, gebruiksdoel en het bouwjaar van
 * het oudste pand. `stop` bij te veel verzoeken of een storing.
 */
export async function haalVerblijfsobject(
  fetchFn: typeof fetch,
  vboId: string,
): Promise<
  | { ok: true; oppervlakte: number | null; gebruiksdoel: string | null; bouwjaar: number | null }
  | { ok: false; stop?: BagStop }
> {
  if (!VboId.safeParse(vboId).success) return { ok: false };
  const r = await haal(fetchFn, vboUrl(vboId));
  if (!r.ok) return "stop" in r ? { ok: false, stop: r.stop } : { ok: false };
  const v = VboSchema.safeParse(r.json);
  const p = v.success ? v.data.features[0]?.properties : undefined;
  if (!p) return { ok: false };
  let bouwjaar: number | null = null;
  for (const href of (p["pand.href"] ?? []).filter((h) => h.startsWith(PAND_PREFIX))) {
    const pand = await haal(fetchFn, href.split("?")[0] + "?f=json");
    if (!pand.ok) {
      if ("stop" in pand) return { ok: false, stop: pand.stop };
      continue;
    }
    const d = PandSchema.safeParse(pand.json);
    const j = d.success ? (d.data.properties.bouwjaar ?? null) : null;
    if (j !== null && (bouwjaar === null || j < bouwjaar)) bouwjaar = j;
  }
  return {
    ok: true,
    oppervlakte: p.oppervlakte ?? null,
    gebruiksdoel: p.gebruiksdoel?.trim().slice(0, 200) || null,
    bouwjaar,
  };
}
