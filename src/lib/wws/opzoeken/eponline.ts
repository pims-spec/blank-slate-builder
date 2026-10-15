// Energielabel via EP-Online — overgezet uit epAdresVelden(), epFindField(), epToIsoDate(),
// epWoningtype(), epBepaalSoort() en applyEpLabel() in wws-site.html.
// eponline.vergelijk.test.ts vergelijkt epToepassen() met de originele applyEpLabel().
//
// Het antwoord van EP-Online is onbetrouwbare data: leesEpAntwoord() laat via zod alleen de
// bekende velden door (met lengtegrenzen) voordat er iets in een telling komt.
import * as z from "zod";
import { LABELS, num } from "../basis";
import type { TellingMeta } from "../opslag/types";
import type { Energie, WwsInput } from "../types";

// ---------- adres → zoekvelden ----------

export interface EpZoekVelden {
  postcode: string;
  huisnummer: string;
  huisletter: string;
  huisnummertoevoeging: string;
}

/** Postcode en huisnummer (+ letter of toevoeging) uit de meta — epAdresVelden() */
export function epAdresVelden(
  meta: Partial<Pick<TellingMeta, "postcode" | "huisnummer">>,
): EpZoekVelden {
  const postcode = String(meta.postcode || "")
    .replace(/\s+/g, "")
    .toUpperCase();
  const hn = String(meta.huisnummer || "").trim();
  const mHn = /^(\d+)\s*[-\s]?\s*(.*)$/.exec(hn);
  const huisnummer = mHn ? mHn[1]! : "";
  const rest = mHn ? mHn[2]!.trim() : "";
  let huisletter = "",
    huisnummertoevoeging = "";
  if (/^[A-Za-z]$/.test(rest)) huisletter = rest;
  else if (rest) huisnummertoevoeging = rest;
  return { postcode, huisnummer, huisletter, huisnummertoevoeging };
}

// ---------- antwoord van EP-Online ----------

const tekst = z.string().max(100);
const getalOfTekst = z.union([z.number().finite(), z.string().max(20)]);

/** De velden van een EP-Online-label die de app gebruikt; al het andere wordt weggelaten */
export const EpLabelSchema = z.object({
  Energieklasse: tekst.nullish(),
  Registratiedatum: tekst.nullish(),
  Opnamedatum: tekst.nullish(),
  Geldig_tot: tekst.nullish(),
  Bouwjaar: getalOfTekst.nullish(),
  Gebouwtype: tekst.nullish(),
  EnergieIndex: getalOfTekst.nullish(),
});
export type EpLabel = z.infer<typeof EpLabelSchema>;

/**
 * Leest het (onbetrouwbare) antwoord van EP-Online: een lijst labels voor het adres. Geeft het
 * eerste geldige label terug, met alleen de bekende velden, of null.
 */
export function leesEpAntwoord(json: unknown): EpLabel | null {
  const lijst = z.array(z.unknown()).max(50).safeParse(json);
  if (!lijst.success) return null;
  for (const item of lijst.data) {
    const r = EpLabelSchema.safeParse(item);
    if (r.success) return r.data;
  }
  return null;
}

// ---------- van label naar telling ----------

/** Zoekt een veld op (genormaliseerde) naam, ook genest — epFindField() */
export function epFindField(
  obj: unknown,
  names: readonly string[],
  seen = new Set<unknown>(),
): unknown {
  if (obj == null || typeof obj !== "object" || seen.has(obj)) return undefined;
  seen.add(obj);
  if (Array.isArray(obj)) {
    for (const it of obj) {
      const v = epFindField(it, names, seen);
      if (v !== undefined) return v;
    }
    return undefined;
  }
  const o = obj as Record<string, unknown>;
  for (const k of Object.keys(o)) {
    const nk = k.toLowerCase().replace(/[^a-z]/g, "");
    if (names.some((n) => nk === n || nk.endsWith(n)) && o[k] != null && o[k] !== "") return o[k];
  }
  for (const k of Object.keys(o)) {
    const v = epFindField(o[k], names, seen);
    if (v !== undefined) return v;
  }
  return undefined;
}

/** "2021-03-04…" of "20210304" → "2021-03-04", anders "" — epToIsoDate() */
export function epToIsoDate(v: unknown): string {
  if (!v) return "";
  const s = String(v);
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return m[1] + "-" + m[2] + "-" + m[3];
  m = /^(\d{4})(\d{2})(\d{2})$/.exec(s);
  if (m) return m[1] + "-" + m[2] + "-" + m[3];
  return "";
}

/** Gebouwtype van EP-Online → woningtype, of null — epWoningtype() */
export function epWoningtype(gebouwtype: unknown): WwsInput["woningtype"] | null {
  if (!gebouwtype) return null;
  const g = String(gebouwtype).toLowerCase();
  if (
    /vrijstaand|twee.?onder|2.?onder|hoekwoning|tussenwoning|rijwoning|rijtjeswoning|hoekhuis|eengezins|landhuis|boerderij/.test(
      g,
    )
  )
    return "eengezins";
  if (
    /appartement|flat|maisonnette|portiek|galerij|benedenwoning|bovenwoning|meergezins|duplex/.test(
      g,
    )
  )
    return "meergezins";
  return null;
}

/**
 * Welke soort energiegegeven geldt: label vanaf 2021, label vóór 2015, energie-index
 * (2015–2021) of bouwjaar (geen geldig label) — epBepaalSoort(). Verlopen labels tellen niet.
 */
export function epBepaalSoort(
  r: unknown,
  vandaag = new Date(),
): { soort: Energie["soort"]; klasse: string | null; datum: string } {
  const klasse = epFindField(r, ["energieklasse", "labelklasse", "energielabel"]);
  const regdatum = epToIsoDate(epFindField(r, ["registratiedatum"]));
  const opndatum = epToIsoDate(epFindField(r, ["opnamedatum"]));
  const datum = regdatum || opndatum;
  const geldigTot = epToIsoDate(epFindField(r, ["geldigtot"]));
  const verlopen = !!(geldigTot && new Date(geldigTot) < vandaag);
  const geldigKlasse = !!(
    klasse &&
    (LABELS as readonly string[]).includes(String(klasse)) &&
    !verlopen
  );
  const dt = datum ? new Date(datum) : null;
  let soort: Energie["soort"] = "bouwjaar";
  if (geldigKlasse) {
    if (dt && dt < new Date("2015-01-01")) soort = "labelOud";
    else if (dt && dt < new Date("2021-01-01")) soort = "index";
    else soort = "label";
  }
  return { soort, klasse: geldigKlasse ? String(klasse) : null, datum };
}

export interface EpToepassing {
  input: WwsInput;
  meta: TellingMeta;
  /** Melding voor de gebruiker (zoals de toasts in de bron) */
  meldingen: string[];
  /** Is er iets overgenomen? (in de bron altijd: de soort wordt altijd gezet) */
  gewijzigd: boolean;
}

/**
 * Neemt een EP-Online-label over in de telling: soort, labelklasse of index-klasse,
 * registratiedatum, bouwjaar en woningtype — applyEpLabel(). Wijzigt input/meta niet.
 */
export function epToepassen(
  input: WwsInput,
  meta: TellingMeta,
  r: unknown,
  vandaag = new Date(),
): EpToepassing {
  const inp = structuredClone(input);
  const m = structuredClone(meta) as TellingMeta & { auto?: Record<string, boolean> };
  m.auto = m.auto || {};
  const meldingen: string[] = [];
  const { soort, klasse, datum } = epBepaalSoort(r, vandaag);
  const indexRuw = epFindField(r, ["energieindex"]);
  const bouwjaar = epFindField(r, ["bouwjaar"]);
  const gebouwtype = epFindField(r, ["gebouwtype"]);
  const woningtype = epWoningtype(gebouwtype);
  let changed = false;
  const gelukt: string[] = [];
  inp.energie.soort = soort;
  changed = true;
  if (soort === "label" || soort === "labelOud") {
    inp.energie.label = klasse as Energie["label"];
    gelukt.push("energielabel");
  } else if (soort === "index") {
    if (indexRuw && num(indexRuw) > 0) {
      const ei = num(indexRuw);
      inp.energie.indexKlasse = String(
        [0.6, 0.8, 1.2, 1.4, 1.8, 2.1, 2.4, 2.7, 999].findIndex((x) => ei <= x),
      );
      gelukt.push("energie-index");
    } else {
      meldingen.push(
        "Geregistreerd als energie-index (2015-2021): kies hieronder zelf de juiste klasse, dit kon niet automatisch worden bepaald.",
      );
    }
  } else if (bouwjaar && /^\d{3,4}$/.test(String(bouwjaar))) {
    inp.energie.bouwjaar = String(bouwjaar);
  }
  if (datum) inp.energie.datum = datum;
  if (bouwjaar && /^\d{3,4}$/.test(String(bouwjaar))) {
    m.bouwjaar = String(bouwjaar);
    m.auto["bouwjaar"] = true;
    changed = true;
    gelukt.push("bouwjaar");
  }
  if (woningtype) {
    inp.woningtype = woningtype;
    m.auto["woningtype"] = true;
    changed = true;
    gelukt.push("type woning");
  }
  if (!changed) {
    meldingen.push("Geen bruikbare gegevens gevonden in het antwoord.");
    return { input, meta, meldingen, gewijzigd: false };
  }
  meldingen.push(
    (gelukt.length ? gelukt.join(", ").replace(/^./, (c) => c.toUpperCase()) : "Gegevens") +
      " overgenomen van EP-Online.",
  );
  return { input: inp, meta: m, meldingen, gewijzigd: true };
}
