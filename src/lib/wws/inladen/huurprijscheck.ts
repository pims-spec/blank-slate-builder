// Een bestaande puntentelling inladen uit de "Resultaat Huurprijscheck" van de Huurcommissie: de
// PDF zelf of de bijlage in een rapport (CBRE). De tekst is per regel uit de PDF gehaald
// (pdfRegels in plattegrond/beeld.ts); hier wordt hij zonder AI omgezet naar een WwsInput.
// Wat de PDF niet vertelt (maten, labeldatum, privé of gemeenschappelijk) komt in `meldingen`.
import { OVERIG_TYPES, VERTREK_TYPES, facDefault } from "../basis";
import { legeInput } from "../legeInput";
import type { TellingMeta } from "../opslag/types";
import type {
  Aanrecht,
  BuitenSoort,
  FacBadkamer,
  FacKeuken,
  FacToilet,
  KeukenVoorzKey,
  Labelklasse,
  OverigTypeKey,
  OverigeRuimte,
  SanVoorzKey,
  Vertrek,
  VertrekTypeKey,
  WwsInput,
  WwsResultaat,
} from "../types";

/** Eén tekststuk uit pdf.js: tekst met de plek op de pagina */
export interface PdfStuk {
  str: string;
  x: number;
  y: number;
}

/** Tekststukken van één pagina → regels van boven naar beneden, links naar rechts */
export function stukkenNaarRegels(stukken: readonly PdfStuk[]): string[] {
  const perY = new Map<number, PdfStuk[]>();
  for (const s of stukken) {
    if (!s.str.trim()) continue;
    const y = Math.round(s.y);
    const rij = perY.get(y) ?? [];
    rij.push(s);
    perY.set(y, rij);
  }
  return [...perY.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([, rij]) =>
      rij
        .sort((a, b) => a.x - b.x)
        .map((s) => s.str)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim(),
    )
    .filter(Boolean);
}

const KOP = "Resultaat Huurprijscheck";

/**
 * De regels van de Huurprijscheck: vanaf de pagina met "Resultaat Huurprijscheck" tot het eind.
 * null als die er niet in staat.
 */
export function zoekHuurprijscheck(paginas: readonly (readonly string[])[]): string[] | null {
  const start = paginas.findIndex((p) => p.some((r) => r.includes(KOP)));
  if (start < 0) return null;
  const regels = paginas.slice(start).flat();
  return regels.slice(regels.findIndex((r) => r.includes(KOP)));
}

/** Punten per onderdeel, zoals in de Huurprijscheck ("Totaal Woning 35,75") */
export interface HpcOnderdelen {
  woning: number | null;
  binnen: number | null;
  buiten: number | null;
  bijzonderheden: number | null;
}

export interface HpcVerwacht {
  totaal: number | null;
  maxHuur: number | null;
  /** "1 januari 2026 - 31 december 2026" */
  tijdvak: string;
  /** Datum ingevuld, yyyy-mm-dd ("" als onbekend) */
  datum: string;
  onderdelen: HpcOnderdelen;
}

export type HpcUitkomst =
  | {
      ok: true;
      meta: Pick<TellingMeta, "adres" | "huisnummer" | "postcode" | "plaats" | "peildatum">;
      input: WwsInput;
      verwacht: HpcVerwacht;
      /** Wat niet (zeker) overgenomen is; de gebruiker kijkt dit na */
      meldingen: string[];
    }
  | { ok: false; fout: string };

// ---------- getallen ----------
/** "1,50" → 1.5; "11.3" → 11.3; "-15" → -15 */
function getal(s: string): number {
  const t = s.replace(/[−–]/g, "-");
  const n = t.includes(",") ? Number(t.replace(/\./g, "").replace(",", ".")) : Number(t);
  return Number.isFinite(n) ? n : NaN;
}
/** "€ 1.433,99" of "400.000" → 1433.99 / 400000 */
function euro(s: string): number {
  return Number(s.replace(/[€\s.]/g, "").replace(",", "."));
}
const GETAL = String.raw`-?[\d.,]+`;
/** Laatste getal op de regel: [rest, getal] */
function splitsGetal(r: string): [string, number] | null {
  const m = new RegExp(String.raw`^(.*?)\s*(${GETAL})$`).exec(r);
  if (!m || !/\d/.test(m[2]!)) return null;
  const n = getal(m[2]!);
  return Number.isNaN(n) ? null : [m[1]!.trim(), n];
}

/** Zonder accenten en hoofdletters, voor het vergelijken van namen */
const plat = (s: string) =>
  s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/\s+/g, " ").trim();
/** "Slaapkamer (2)" → "slaapkamer" */
const zonderNr = (s: string) => plat(s.replace(/\s*\(\d+\)\s*$/, ""));

// ---------- ruimten ----------
const VERTREK_NAMEN: Record<string, VertrekTypeKey> = {
  ...Object.fromEntries(VERTREK_TYPES.map((t) => [plat(t.l), t.k])),
  "woon- en slaapkamer met open keuken": "woonslaap_ok",
  zolderkamer: "zolderkamer",
};
const OVERIG_NAMEN: Record<string, OverigTypeKey> = {
  ...Object.fromEntries(OVERIG_TYPES.map((t) => [plat(t.l), t.k])),
  toilet: "toilet",
  hal: "hal",
  gang: "hal",
  wasruimte: "wasruimte",
  bijkeuken: "wasruimte",
  schuur: "berging_uit",
  fietsenberging: "berging_uit",
  zolder: "zolder",
};

type Groep = "vertrekken" | "overig";
function ruimteType(naam: string, voorkeur?: Groep): { groep: Groep; type: string } | null {
  const k = zonderNr(naam);
  const v = VERTREK_NAMEN[k],
    o = OVERIG_NAMEN[k];
  if (v && o)
    return voorkeur === "overig" ? { groep: "overig", type: o } : { groep: "vertrekken", type: v };
  if (v) return { groep: "vertrekken", type: v };
  if (o) return { groep: "overig", type: o };
  return null;
}

// ---------- voorzieningen ----------
const KEUKEN_VOORZ: Record<string, KeukenVoorzKey> = {
  "inbouw afzuiginstallatie": "afzuig",
  "inbouw kookplaat inductie": "kook_ind",
  "inbouw kookplaat keramisch": "kook_kera",
  "inbouw kookplaat gas": "kook_gas",
  "inbouw koelkast": "koelkast",
  "inbouw vrieskast": "vriezer",
  "inbouw oven elektrisch": "oven",
  "inbouw oven gas": "oven_gas",
  "inbouw magnetron": "magnetron",
  "inbouw vaatwasmachine": "vaatwasser",
  "extra kastruimte": "kast",
  eenhandsmengkraan: "kraan_een",
  "thermostatische mengkraan": "kraan_thermo",
  kokendwaterfunctie: "kokend",
  kokendwaterkraan: "kokend",
};
const SAN_VOORZ: Record<string, SanVoorzKey> = {
  "bad met bubbelfunctie": "bubbel",
  bubbelfunctie: "bubbel",
  "volledige afscheiding van de douche": "afscheiding",
  handdoekenradiator: "handdoekrad",
  "wastafelkast- of meubel": "kastje",
  kastruimte: "kastruimte",
  stopcontact: "stopcontact",
  eenhandsmengkraan: "kraan_een",
  "thermostatische mengkraan": "kraan_thermo",
};
type SanTelling =
  "wastafel" | "meerpers" | "douche" | "bad" | "badDouche" | "toiletStaand" | "toiletHang";
const SAN_TELLING: Record<string, SanTelling> = {
  wastafel: "wastafel",
  "meerpersoons wastafel": "meerpers",
  douche: "douche",
  bad: "bad",
  "bad en aparte douche": "badDouche",
  "bad met douche": "badDouche",
  toilet: "toiletStaand",
  "staand toilet": "toiletStaand",
  "hangend toilet": "toiletHang",
};
const BUITEN: Record<string, BuitenSoort> = {
  balkon: "balkon",
  dakterras: "dakterras",
  voortuin: "voorzijtuin",
  zijtuin: "voorzijtuin",
  "voortuin / zijtuin": "voorzijtuin",
  achtertuin: "achtertuin",
  tuin: "achtertuin",
  loggia: "loggia",
  platje: "platje",
  terras: "terras",
  oprit: "oprit",
  fietsenstalling: "fietsenstalling",
  "frans balkon": "fransbalkon",
};
const LABELS: readonly Labelklasse[] = [
  "A++++",
  "A+++",
  "A++",
  "A+",
  "A",
  "B",
  "C",
  "D",
  "E",
  "F",
  "G",
];

/** "Wastafel 2x 2" → { naam, aantal, p }; zonder "Nx" (zoals "Douche 4") is het aantal 1 */
function voorziening(r: string): { naam: string; aantal: number; p: number } | null {
  const m = new RegExp(String.raw`^(.+?)\s+(\d+)x\s+(${GETAL})$`).exec(r);
  if (m) return { naam: plat(m[1]!), aantal: Number(m[2]), p: getal(m[3]!) };
  const g = splitsGetal(r);
  return g ? { naam: plat(g[0]), aantal: 1, p: g[1] } : null;
}

const DATUM = /^(\d{1,2})-(\d{1,2})-(\d{4})$/;
const isoDatum = (d: string, m: string, j: string) =>
  `${j}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;

/** "Aalbersestraat 118, 1067GH Amsterdam" → straat, huisnummer, postcode, plaats */
export function splitsAdres(
  regel: string,
): { adres: string; huisnummer: string; postcode: string; plaats: string } | null {
  const m = /^(.+?),?\s+(\d{4})\s?([A-Za-z]{2})\s+(.+)$/.exec(regel.trim());
  if (!m) return null;
  const straat = m[1]!.replace(/,\s*$/, "").trim();
  const sh = /^(.+?)\s+(\d\S*(?:\s*-\s*\S+)?)$/.exec(straat);
  return {
    adres: sh ? sh[1]! : straat,
    huisnummer: sh ? sh[2]!.replace(/\s+/g, "") : "",
    postcode: m[2]! + " " + m[3]!.toUpperCase(),
    plaats: m[4]!.trim(),
  };
}

/** Regels die niets toevoegen (koppen, voetteksten, uitleg) */
const OVERSLAAN = [
  /^\(afgetopt\)\*?$/,
  /^\*\s*Deze ruimte/,
  /^Pagina \d+ van \d+$/,
  // losse punten of een streepje op een eigen regel (de PDF breekt de regel af)
  /^-?[\d.,]*$/,
  /^Binnenruimtes( m²)? Punten$/,
];

/** Zet de regels van een Huurprijscheck om naar een telling. */
export function leesHuurprijscheck(regels: readonly string[]): HpcUitkomst {
  const R = regels
    .map((r) =>
      r
        .replace(/\u00a0/g, " ")
        .replace(/\s+/g, " ")
        .trim(),
    )
    .filter(Boolean);
  if (!R.some((r) => r.includes(KOP)))
    return { ok: false, fout: "Dit is geen ‘Resultaat Huurprijscheck’ van de Huurcommissie." };
  const detail = R.findIndex((r) => r === "Details van de puntentelling");
  if (detail < 0)
    return { ok: false, fout: "De details van de puntentelling ontbreken in deze Huurprijscheck." };
  const kop = R.slice(0, detail);
  const meldingen: string[] = [];
  // "Keuken mist gegevens." onder "Maak de puntentelling compleet"
  for (const r of R.filter((x) => /mist gegevens/i.test(x)))
    meldingen.push(`De Huurprijscheck meldt: ‘${r}’ Controleer dit.`);

  // ---------- informatie en samenvatting ----------
  if (kop.some((r) => /onzelfstandig/i.test(r)))
    return {
      ok: false,
      fout: "Dit is een telling voor onzelfstandige woonruimte; de app rekent alleen met zelfstandige woningen.",
    };
  const adresRegel = kop.find((r) => /\d{4}\s?[A-Z]{2}\s/.test(r) && /,/.test(r));
  const adres = adresRegel ? splitsAdres(adresRegel.replace(/^Adres\s+/, "")) : null;
  if (!adres) meldingen.push("Het adres is niet gevonden; vul het zelf in.");

  const datumRegel = kop.map((r) => r.replace(/^Datum ingevuld\s+/, "")).find((r) => DATUM.test(r));
  const dm = datumRegel ? DATUM.exec(datumRegel) : null;
  const datum = dm ? isoDatum(dm[1]!, dm[2]!, dm[3]!) : "";
  const tijdvak =
    kop
      .map((r) => r.replace(/^Tijdvak\s+/, ""))
      .find((r) => /^\d{1,2} \p{L}+ \d{4} - \d{1,2} \p{L}+ \d{4}$/u.test(r)) ?? "";

  let totaal: number | null = null;
  const tRegel = kop.find((r) => /^Totaal aantal punten\s+\d+$/.test(r));
  if (tRegel) totaal = getal(tRegel.replace(/\D+/, ""));
  else {
    const s = kop.indexOf("Samenvatting");
    const v = s >= 0 ? kop[s + 1] : undefined;
    if (v && /^\d+$/.test(v)) totaal = Number(v);
  }
  let maxHuur: number | null = null;
  const mh = kop.findIndex((r) => r.startsWith("Maximale huurprijs"));
  if (mh >= 0) {
    const m = /€\s*([\d.,]+)/.exec(kop[mh]!) ?? /^€\s*([\d.,]+)$/.exec(kop[mh + 1] ?? "");
    if (m) maxHuur = euro(m[1]!);
  }

  const input = legeInput();
  const herkomst = "Huurprijscheck" + (dm ? " " + dm[0] : "");
  // opslagen (staan alleen in de samenvatting)
  const kopTekst = kop.join(" ");
  if (/stads- en( dorpsgezicht)?/i.test(kopTekst)) input.opslag.keuze = "stads";
  else if (/rijksmonument/i.test(kopTekst)) {
    input.opslag.keuze = "rijks_na";
    meldingen.push(
      "Rijksmonument: gekozen is ‘huurcontract na 1 juli 2024’. Controleer dit; vóór 1 juli 2024 geldt een andere regeling.",
    );
  } else if (/(gemeentelijk|provinciaal) monument/i.test(kopTekst)) input.opslag.keuze = "gemprov";

  // ---------- details ----------
  const onderdelen: HpcOnderdelen = {
    woning: null,
    binnen: null,
    buiten: null,
    bijzonderheden: null,
  };
  type Sectie = "woning" | "binnen" | "buiten" | "bijz" | null;
  type Sub = "vertrekken" | "overig" | "verw" | "keuken" | "san" | null;
  let sectie: Sectie = null,
    sub: Sub = null;
  let keuken: FacKeuken | null = null;
  let san: { naam: string; fac: FacBadkamer | FacToilet | null } | null = null;
  let geenBuiten = false;

  const alle = () => [
    ...input.vertrekken.map((r) => ({ r, groep: "vertrekken" as const })),
    ...input.overig.map((r) => ({ r, groep: "overig" as const })),
  ];
  const zoekRuimte = (naam: string) => alle().find((x) => plat(x.r.naam ?? "") === plat(naam));
  /** Bestaande ruimte, of een nieuwe zonder m² (toiletruimte en overloop staan niet in de m²) */
  function ruimte(naam: string, voorkeur?: Groep) {
    const x = zoekRuimte(naam);
    if (x) return x;
    const t = ruimteType(naam, voorkeur);
    if (!t) return null;
    return nieuweRuimte(naam, t, 0);
  }
  function nieuweRuimte(naam: string, t: { groep: Groep; type: string }, m2: number) {
    if (t.groep === "vertrekken") {
      const r: Vertrek = { type: t.type as VertrekTypeKey, naam, m2, verwarmd: false, herkomst };
      input.vertrekken.push(r);
      return { r, groep: t.groep };
    }
    const r: OverigeRuimte = { type: t.type as OverigTypeKey, naam, m2, verwarmd: false, herkomst };
    input.overig.push(r);
    return { r, groep: t.groep };
  }
  const onbekend = (r: string) => meldingen.push(`Niet overgenomen: ‘${r}’.`);

  for (const r of R.slice(detail + 1)) {
    if (OVERSLAAN.some((p) => p.test(r))) continue;
    if (r === "Woning Punten") {
      sectie = "woning";
      continue;
    }
    if (/^Buitenruimtes( m²)? Punten$/.test(r)) {
      sectie = "buiten";
      continue;
    }
    if (r === "Bijzonderheden Punten") {
      sectie = "bijz";
      continue;
    }
    // "Totaal Binnenruimtes" herhaalt per pagina; de sectie loopt daarna gewoon door
    const tot = /^Totaal (Woning|Binnenruimtes|Buitenruimtes|Bijzonderheden)\s+(-?[\d.,]+)$/.exec(
      r,
    );
    if (tot) {
      const n = getal(tot[2]!);
      if (tot[1] === "Woning") onderdelen.woning = n;
      else if (tot[1] === "Binnenruimtes") onderdelen.binnen = n;
      else if (tot[1] === "Buitenruimtes") onderdelen.buiten = n;
      else onderdelen.bijzonderheden = n;
      continue;
    }
    // binnenruimtes: een subkop zet de sectie (de kop "Binnenruimtes m² Punten" herhaalt per pagina)
    let m: RegExpExecArray | null;
    if (/^Vertrekken:\s/.test(r)) {
      [sectie, sub] = ["binnen", "vertrekken"];
      continue;
    }
    if (/^Overige ruimten:\s/.test(r)) {
      [sectie, sub] = ["binnen", "overig"];
      continue;
    }
    if (/^Verwarming( en verkoeling)?\s+-?[\d.,]+$/.test(r)) {
      [sectie, sub] = ["binnen", "verw"];
      continue;
    }
    if (/^Keukens\s+-?[\d.,]+$/.test(r)) {
      [sectie, sub, keuken] = ["binnen", "keuken", null];
      continue;
    }
    if (/^Sanitair\s+-?[\d.,]+$/.test(r)) {
      [sectie, sub, san] = ["binnen", "san", null];
      continue;
    }

    if (sectie === "woning") {
      if ((m = /^WOZ-punten:\s*€\s*([\d.]+)\s*\(peildatum:\s*([^)]*)\)/.exec(r))) {
        input.woz.waarde = euro(m[1]!);
        const j = /(\d{4})\s*$/.exec(m[2]!);
        if (j) input.woz.jaar = String(Number(j[1]) + 1);
        else meldingen.push("De WOZ-peildatum is niet gevonden; controleer de WOZ-beschikking.");
      } else if ((m = /^Energielabel:\s*(.+?)\s+-?[\d.,]+$/.exec(r))) leesEnergie(m[1]!);
      else if ((m = /^Woonvorm:\s*(.+?)\s+-?[\d.,]+$/.exec(r)))
        input.woningtype = /eengezins/i.test(m[1]!) ? "eengezins" : "meergezins";
      else onbekend(r);
      continue;
    }

    if (sectie === "binnen" && (sub === "vertrekken" || sub === "overig")) {
      const g = splitsGetal(r);
      const t = g && ruimteType(g[0], sub);
      if (!g || !t) {
        onbekend(r);
        continue;
      }
      nieuweRuimte(g[0], t.groep === sub ? t : { groep: sub, type: "overig" }, g[1]);
      if (t.groep !== sub)
        meldingen.push(`‘${g[0]}’ is als ‘overig’ overgenomen; kies zelf het type.`);
      continue;
    }

    if (sectie === "binnen" && sub === "verw") {
      if ((m = /^(.+?)\s+\((verwarmd|verkoeld|verwarmd en verkoeld)\)\s+-?[\d.,]+$/.exec(r))) {
        const x = ruimte(m[1]!);
        if (!x) {
          onbekend(r);
          continue;
        }
        if (m[2] !== "verkoeld") x.r.verwarmd = true;
        if (m[2] !== "verwarmd") {
          if (x.groep === "vertrekken") (x.r as Vertrek).verkoeld = true;
          else meldingen.push(`Verkoeling van ‘${m[1]}’ is niet overgenomen.`);
        }
      } else onbekend(r);
      continue;
    }

    if (sectie === "binnen" && sub === "keuken") {
      if ((m = /^Aanrecht:\s*(.+?)(?:\s+-?[\d.,]+)?$/.exec(r))) {
        if (!keuken) {
          onbekend(r);
          continue;
        }
        const a = plat(m[1]!);
        keuken.keuken.lengte = (
          /langer dan 2|2 meter of (meer|langer)/.test(a)
            ? ">=2"
            : /tussen de 1 en 2/.test(a)
              ? "1-2"
              : "<1"
        ) as Aanrecht;
        continue;
      }
      const kopRuimte = splitsGetal(r)?.[0] ?? r;
      if (!/\s\d+x\s/.test(r) && ruimteType(kopRuimte)) {
        const x = ruimte(kopRuimte);
        if (x) {
          const f = facDefault("keuken", true) as FacKeuken;
          x.r.fac = f;
          keuken = f;
        }
        continue;
      }
      const v = voorziening(r);
      const k = v && KEUKEN_VOORZ[v.naam];
      if (!keuken || !v || !k) onbekend(r);
      else keuken.keuken.voorz[k] = (Number(keuken.keuken.voorz[k]) || 0) + v.aantal;
      continue;
    }

    if (sectie === "binnen" && sub === "san") {
      const kopRuimte = splitsGetal(r)?.[0] ?? r;
      if (!/\s\d+x\s/.test(r) && ruimteType(kopRuimte, "overig") && !SAN_TELLING[plat(kopRuimte)]) {
        const x = ruimte(kopRuimte, "overig");
        if (!x) continue;
        if (x.r.type === "badkamer") {
          const f = facDefault("badkamer", true) as FacBadkamer;
          x.r.fac = f;
          san = { naam: kopRuimte, fac: f };
        } else if (x.r.type === "toilet") {
          // een toiletruimte zonder regels heeft een staand toilet
          const f = facDefault("toilet") as FacToilet;
          x.r.fac = f;
          san = { naam: kopRuimte, fac: f };
        } else {
          san = { naam: kopRuimte, fac: null };
          meldingen.push(`Sanitair in ‘${kopRuimte}’ is niet overgenomen; vul het zelf in.`);
        }
        continue;
      }
      const v = voorziening(r);
      if (!san || !v) {
        onbekend(r);
        continue;
      }
      const f = san.fac;
      if (!f) continue;
      if (f.kind === "toilet") {
        if (v.naam === "hangend toilet") f.toilet.toilet = "hangend";
        else if (v.naam === "toilet" || v.naam === "staand toilet") f.toilet.toilet = "staand";
        else if (v.naam === "wastafel" || v.naam === "fontein") f.toilet.fontein = true;
        else onbekend(r);
        continue;
      }
      const tel = SAN_TELLING[v.naam];
      const vz = SAN_VOORZ[v.naam];
      if (tel) f.san[tel] = (Number(f.san[tel]) || 0) + v.aantal;
      else if (vz) f.san.voorz[vz] = (Number(f.san.voorz[vz]) || 0) + v.aantal;
      else onbekend(r);
      continue;
    }

    if (sectie === "buiten") {
      if (/^Oppervlakte:/.test(r)) continue;
      if (/^Geen buitenruimte/i.test(r)) {
        geenBuiten = true;
        continue;
      }
      const g = splitsGetal(r);
      const soort = g && BUITEN[zonderNr(g[0])];
      if (!g || !soort) {
        onbekend(r);
        continue;
      }
      input.buiten.ruimten.push({ soort, groep: "priv", m2: g[1] });
      continue;
    }

    if (sectie === "bijz") {
      if (/^Bijzondere voorzieningen/.test(r)) continue;
      const v = voorziening(r);
      if (v && /intercom|aanbel/.test(v.naam)) input.bijz.aanbel = true;
      else if (v && /laadpa(al|len)/.test(v.naam)) input.bijz.laadpalen = v.aantal;
      else onbekend(r);
      continue;
    }

    onbekend(r);
  }

  function leesEnergie(t: string) {
    const E = input.energie;
    let m: RegExpExecArray | null;
    if ((m = /Label\s+(A\+*|[B-G])(?![\p{L}+])/u.exec(t)) && LABELS.includes(m[1] as Labelklasse)) {
      E.soort = "label";
      E.label = m[1] as Labelklasse;
      meldingen.push(
        "Energielabel " +
          m[1] +
          " overgenomen zonder registratiedatum; vul die in om de geldigheid te controleren.",
      );
    } else if (/EI/.test(t)) {
      const idx = INDEX_TEKST.findIndex((x) => x === t.replace(/\s+/g, " ").trim());
      if (idx < 0) meldingen.push(`Energie-index ‘${t}’ is niet herkend; kies de klasse zelf.`);
      else {
        E.soort = "index";
        E.indexKlasse = String(idx);
      }
    } else if (/energieprestatievergoeding|EPV/i.test(t)) {
      E.soort = "label";
      E.label = "EPV";
    } else if ((m = /(\d{4})/.exec(t))) {
      E.soort = "bouwjaar";
      // "1976 of eerder", "1977 t/m 1978": het eerste jaar valt in dezelfde klasse
      E.bouwjaar = Number(m[1]);
    } else meldingen.push(`Energielabel ‘${t}’ is niet herkend; vul het zelf in.`);
  }

  if (
    !geenBuiten &&
    input.buiten.ruimten.length === 0 &&
    onderdelen.buiten != null &&
    onderdelen.buiten > 0
  )
    meldingen.push("De buitenruimten zijn niet gevonden; vul ze zelf in.");
  if (input.buiten.ruimten.length)
    meldingen.push(
      "Buitenruimten zijn als privé overgenomen; de Huurprijscheck zegt niet of ze gemeenschappelijk zijn.",
    );
  if (input.vertrekken.length + input.overig.length)
    meldingen.push("Alleen de m² zijn overgenomen, geen maten (lengte × breedte).");

  return {
    ok: true,
    meta: {
      adres: adres?.adres ?? "",
      huisnummer: adres?.huisnummer ?? "",
      postcode: adres?.postcode ?? "",
      plaats: adres?.plaats ?? "",
      peildatum: datum || new Date().toISOString().slice(0, 10),
    },
    input,
    verwacht: { totaal, maxHuur, tijdvak, datum, onderdelen },
    meldingen,
  };
}

/** De klassen van de energie-index zoals de Huurprijscheck ze schrijft (INDEX_KLASSEN) */
const INDEX_TEKST = [
  "EI ≤ 0,6",
  "0,6 < EI ≤ 0,8",
  "0,8 < EI ≤ 1,2",
  "1,2 < EI ≤ 1,4",
  "1,4 < EI ≤ 1,8",
  "1,8 < EI ≤ 2,1",
  "2,1 < EI ≤ 2,4",
  "2,4 < EI ≤ 2,7",
  "EI > 2,7",
];

// ---------- controle ----------
export interface HpcVergelijkRij {
  naam: string;
  huurcommissie: number | null;
  app: number;
  gelijk: boolean;
}

/** Rubrieknummers van calc() per onderdeel van de Huurprijscheck */
const ONDERDEEL_RUBRIEKEN: [keyof HpcOnderdelen, string, number[]][] = [
  ["woning", "Woning", [4, 11]],
  ["binnen", "Binnenruimtes", [1, 2, 3, 5, 6, 7, 9, 10]],
  ["buiten", "Buitenruimtes", [8]],
  ["bijzonderheden", "Bijzonderheden", [12, 13]],
];
const r2 = (n: number) => Math.round(n * 100) / 100;

/** Punten van de Huurcommissie naast die van de app, per onderdeel en in totaal */
export function vergelijkHuurprijscheck(v: HpcVerwacht, R: WwsResultaat): HpcVergelijkRij[] {
  const rijen = ONDERDEEL_RUBRIEKEN.map(([k, naam, nrs]) => {
    const app = r2(R.rows.filter((x) => nrs.includes(x.nr)).reduce((s, x) => s + x.p, 0));
    const hc = v.onderdelen[k];
    return { naam, huurcommissie: hc, app, gelijk: (hc ?? 0) === app };
  }).filter((x) => x.huurcommissie != null || x.app !== 0);
  rijen.push({
    naam: "Totaal",
    huurcommissie: v.totaal,
    app: R.totaal,
    gelijk: v.totaal === R.totaal,
  });
  return rijen;
}
