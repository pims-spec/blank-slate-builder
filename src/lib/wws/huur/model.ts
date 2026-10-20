// Huurprijsindicator: het rekenmodel voor de markthuur. Een doorzichtige formule, geen door AI
// bedacht bedrag:
//   prijs per m² (referentietabel) × oppervlakte × groottefactor × correctiefactoren + parkeren.
// De factoren worden in een vaste volgorde toegepast; het effect van elke factor in euro's telt
// precies op tot het totaal.
import { LABELS } from "../basis";
import {
  NIVEAU_NAMEN,
  soortVan,
  WONINGTYPE_NAMEN,
  type Afwerking,
  type Betrouwbaarheid,
  type BronRegel,
  type Buiten,
  type HuurNormen,
  type HuurWoningtype,
  type LabelGroep,
  type Onderhoud,
  type Oplevering,
  type Parkeren,
  type RegioNiveau,
  type Staat,
} from "./normen";

/** Wat het opzoeken (PDOK, BAG, EP-Online) oplevert; alles kan ontbreken */
export interface HuurWoning {
  postcode: string;
  huisnummer: string;
  straat: string;
  plaats: string;
  gemeente: string;
  provincie: string;
  bagOppervlakte: number | null;
  bouwjaar: number | null;
  gebruiksdoel: string | null;
  /** Energieklasse uit EP-Online ("C"), registratiedatum yyyy-mm-dd, gebouwtype als tekst */
  label: string | null;
  labelDatum: string | null;
  gebouwtype: string | null;
}

/** De antwoorden op de vragen */
export interface HuurAntwoorden {
  woningtype: HuurWoningtype;
  oppervlakte: number;
  slaapkamers: number;
  /** Energieklasse; "" = onbekend */
  label: string;
  afwerking: Afwerking;
  onderhoud: Onderhoud;
  keuken: Staat;
  badkamer: Staat;
  buiten: Buiten;
  buitenM2: number;
  parkeren: Parkeren;
  oplevering: Oplevering;
  /** Alleen bij appartement of studio */
  verdieping: number;
  lift: boolean;
  /** WOZ-waarde, alleen voor de WWS-check; null = onbekend */
  woz: number | null;
}

/** EP-Online-gebouwtype → woningtype in de vragen, of null */
export function woningtypeUitGebouwtype(g: string | null | undefined): HuurWoningtype | null {
  const s = String(g ?? "").toLowerCase();
  if (!s) return null;
  if (/studio/.test(s)) return "studio";
  if (/appartement|flat|maisonnette|portiek|galerij|benedenwoning|bovenwoning|meergezins/.test(s))
    return "appartement";
  if (/hoek/.test(s)) return "hoekwoning";
  if (/tussen|rij/.test(s)) return "tussenwoning";
  if (/vrijstaand|twee.?onder|2.?onder|halfvrijstaand|geschakeld/.test(s)) return "vrijstaand";
  return null;
}

/** Verstandige startwaarden bij de opgezochte gegevens */
export function standaardAntwoorden(w: HuurWoning | null): HuurAntwoorden {
  const m2 = w?.bagOppervlakte ?? 70;
  return {
    woningtype: woningtypeUitGebouwtype(w?.gebouwtype) ?? "appartement",
    oppervlakte: m2,
    slaapkamers: m2 < 40 ? 0 : m2 < 60 ? 1 : m2 < 85 ? 2 : m2 < 120 ? 3 : 4,
    label: w?.label && LABELS.includes(w.label as never) ? w.label : "",
    afwerking: "goed",
    onderhoud: "goed",
    keuken: "modern",
    badkamer: "modern",
    buiten: "geen",
    buitenM2: 0,
    parkeren: "geen",
    oplevering: "gestoffeerd",
    verdieping: 1,
    lift: true,
    woz: null,
  };
}

const norm = (s: string) => s.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

const NIVEAU_VOLGORDE: RegioNiveau[] = ["pc4", "woonplaats", "gemeente", "provincie", "land"];

/**
 * De meest specifieke bronregel: postcodegebied → woonplaats → gemeente → provincie → landelijk. Binnen een
 * regio gaat een regel voor de juiste soort (appartement/woonhuis) vóór "alle"; bij gelijke regels
 * de recentste.
 */
export function zoekBronRegel(
  regels: readonly BronRegel[],
  w: Pick<HuurWoning, "postcode" | "plaats" | "gemeente" | "provincie">,
  type: HuurWoningtype,
): BronRegel | null {
  const soort = soortVan(type);
  const sleutel: Record<RegioNiveau, string> = {
    pc4: w.postcode.replace(/\s+/g, "").slice(0, 4),
    woonplaats: w.plaats,
    gemeente: w.gemeente,
    provincie: w.provincie,
    land: "Nederland",
  };
  for (const niveau of NIVEAU_VOLGORDE) {
    if (!sleutel[niveau]) continue;
    const kandidaten = regels
      .filter((r) => r.niveau === niveau && norm(r.regio) === norm(sleutel[niveau]))
      .filter((r) => r.woningsoort === soort || r.woningsoort === "alle")
      .sort(
        (a, b) =>
          Number(b.woningsoort === soort) - Number(a.woningsoort === soort) ||
          b.peildatum.localeCompare(a.peildatum),
      );
    if (kandidaten[0]) return kandidaten[0];
  }
  return null;
}

/**
 * Andere bronnen voor dezelfde regio, ter vergelijking (bijv. Pararius naast NVM/VGM NL): regels
 * op hetzelfde niveau, of op woonplaats/gemeente als de gekozen regel daarop zit. Per bron één
 * regel (de juiste soort vóór "alle").
 */
export function vergelijkingsRegels(
  regels: readonly BronRegel[],
  w: Pick<HuurWoning, "postcode" | "plaats" | "gemeente" | "provincie">,
  type: HuurWoningtype,
  gekozen: BronRegel | null,
): BronRegel[] {
  if (!gekozen) return [];
  const soort = soortVan(type);
  const plaatselijk = gekozen.niveau === "woonplaats" || gekozen.niveau === "gemeente";
  const sleutel: Record<RegioNiveau, string> = {
    pc4: w.postcode.replace(/\s+/g, "").slice(0, 4),
    woonplaats: w.plaats,
    gemeente: w.gemeente,
    provincie: w.provincie,
    land: "Nederland",
  };
  const kandidaten = regels
    .filter((r) => r.id !== gekozen.id && r.bron !== gekozen.bron)
    .filter((r) =>
      plaatselijk
        ? r.niveau === "woonplaats" || r.niveau === "gemeente"
        : r.niveau === gekozen.niveau,
    )
    .filter((r) => sleutel[r.niveau] && norm(r.regio) === norm(sleutel[r.niveau]))
    .filter((r) => r.woningsoort === soort || r.woningsoort === "alle")
    .sort(
      (a, b) =>
        Number(b.woningsoort === soort) - Number(a.woningsoort === soort) ||
        b.peildatum.localeCompare(a.peildatum),
    );
  const perBron = new Map<string, BronRegel>();
  for (const r of kandidaten) if (!perBron.has(r.bron)) perBron.set(r.bron, r);
  return [...perBron.values()];
}

export const labelGroep = (l: string): LabelGroep => {
  const i = LABELS.indexOf(l as never);
  if (i < 0) return "onbekend";
  if (i <= LABELS.indexOf("A+")) return "aplus";
  if (l === "A" || l === "B") return "ab";
  if (l === "C" || l === "D") return "cd";
  return "efg";
};

/** Maanden tussen twee datums (yyyy-mm-dd), naar beneden afgerond */
export function maandenTussen(van: string, tot: string): number {
  const [a, b] = [new Date(van + "T12:00:00Z"), new Date(tot + "T12:00:00Z")];
  return (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + b.getUTCMonth() - a.getUTCMonth();
}

export interface FactorEffect {
  /** Sleutel (voor tests en de PDF) en omschrijving op scherm */
  sleutel: string;
  naam: string;
  /** De gekozen waarde, bijv. "Luxe" */
  keuze: string;
  /** Vermenigvuldigingsfactor, of null bij een vast bedrag (parkeren) */
  factor: number | null;
  /** Wat deze factor in euro's per maand doet (in de toegepaste volgorde) */
  effect: number;
  bron: string;
}

export interface BetrouwbaarheidUitleg {
  niveau: Betrouwbaarheid;
  redenen: string[];
}

export interface Markthuur {
  regel: BronRegel | null;
  /** Andere bronnen voor dezelfde regio (alleen ter vergelijking; rekenen doet de app met `regel`) */
  vergelijking?: BronRegel[];
  /** Prijs per m² uit de bron, en de effectieve prijs per m² van de uitkomst */
  bronPrijsM2: number;
  prijsM2: number;
  basis: number;
  factoren: FactorEffect[];
  laag: number;
  verwacht: number;
  hoog: number;
  betrouwbaarheid: BetrouwbaarheidUitleg;
  /** Bij gemeubileerd: meubels horen bij de servicekosten */
  meubelNotitie: string | null;
}

const NAMEN = {
  afwerking: { basis: "Basis", goed: "Goed", luxe: "Luxe" },
  onderhoud: { goed: "Goed", matig: "Matig" },
  staat: { gedateerd: "Gedateerd", modern: "Modern", nieuw: "Nieuw" },
  buiten: { geen: "Geen", balkon: "Balkon", tuin: "Tuin", dakterras: "Dakterras" },
  parkeren: { geen: "Geen", plek: "Eigen parkeerplek", garage: "Garage" },
  oplevering: { kaal: "Kaal", gestoffeerd: "Gestoffeerd", gemeubileerd: "Gemeubileerd" },
  label: {
    aplus: "A+ of beter",
    ab: "A of B",
    cd: "C of D",
    efg: "E, F of G",
    onbekend: "onbekend",
  },
} as const;

export const MEUBEL_NOTITIE =
  "Gemeubileerd: de vergoeding voor meubels en inrichting hoort wettelijk bij de servicekosten, niet bij de kale huur. Deze indicatie is de kale huur.";

const rond5 = (x: number) => Math.round(x / 5) * 5;

/** De markthuur als bandbreedte, met het effect van elke factor */
export function berekenMarkthuur(
  w: HuurWoning,
  a: HuurAntwoorden,
  H: HuurNormen,
  vandaag: string,
): Markthuur {
  const regel = zoekBronRegel(H.regels, w, a.woningtype);
  const bronPrijsM2 = regel?.prijsM2 ?? 0;
  const m2 = Math.max(1, a.oppervlakte);
  const basis = bronPrijsM2 * m2;
  const F = H.factoren;
  const isApp = a.woningtype === "appartement" || a.woningtype === "studio";

  const stappen: { sleutel: string; naam: string; keuze: string; factor: number; bron: string }[] =
    [];
  const ref = regel?.gemOppervlakte || H.referentieM2;
  stappen.push({
    sleutel: "grootte",
    naam: "Grootte (kleinere woningen hebben een hogere prijs per m²)",
    keuze: `${Math.round(m2)} m² t.o.v. ${Math.round(ref)} m²`,
    factor: Math.pow(m2 / ref, -H.grootte.elasticiteit),
    bron: H.grootte.bron,
  });
  // het woningtype alleen als de bronregel niet al voor deze soort is (studio blijft een eigen
  // factor binnen de appartementen)
  const typeFactor =
    regel && regel.woningsoort !== "alle"
      ? a.woningtype === "studio"
        ? F.woningtype.waarden.studio / F.woningtype.waarden.appartement
        : 1
      : F.woningtype.waarden[a.woningtype];
  stappen.push({
    sleutel: "woningtype",
    naam: "Woningtype",
    keuze: WONINGTYPE_NAMEN[a.woningtype],
    factor: typeFactor,
    bron: F.woningtype.bron,
  });
  const lg = labelGroep(a.label);
  stappen.push({
    sleutel: "label",
    naam: "Energielabel",
    keuze: a.label ? a.label + " (" + NAMEN.label[lg] + ")" : "onbekend",
    factor: F.label.waarden[lg],
    bron: F.label.bron,
  });
  stappen.push({
    sleutel: "afwerking",
    naam: "Afwerkingsniveau",
    keuze: NAMEN.afwerking[a.afwerking],
    factor: F.afwerking.waarden[a.afwerking],
    bron: F.afwerking.bron,
  });
  stappen.push({
    sleutel: "onderhoud",
    naam: "Staat van onderhoud",
    keuze: NAMEN.onderhoud[a.onderhoud],
    factor: F.onderhoud.waarden[a.onderhoud],
    bron: F.onderhoud.bron,
  });
  stappen.push({
    sleutel: "keuken",
    naam: "Keuken",
    keuze: NAMEN.staat[a.keuken],
    factor: F.keuken.waarden[a.keuken],
    bron: F.keuken.bron,
  });
  stappen.push({
    sleutel: "badkamer",
    naam: "Badkamer",
    keuze: NAMEN.staat[a.badkamer],
    factor: F.badkamer.waarden[a.badkamer],
    bron: F.badkamer.bron,
  });
  stappen.push({
    sleutel: "buiten",
    naam: "Buitenruimte",
    keuze:
      NAMEN.buiten[a.buiten] + (a.buiten !== "geen" && a.buitenM2 > 0 ? `, ${a.buitenM2} m²` : ""),
    factor: F.buiten.waarden[a.buiten],
    bron: F.buiten.bron,
  });
  stappen.push({
    sleutel: "oplevering",
    naam: "Oplevering",
    keuze: NAMEN.oplevering[a.oplevering],
    factor: F.oplevering.waarden[a.oplevering],
    bron: F.oplevering.bron,
  });
  if (isApp)
    stappen.push({
      sleutel: "lift",
      naam: "Verdieping en lift",
      keuze:
        (a.verdieping <= 0 ? "begane grond" : a.verdieping + "e verdieping") +
        (a.lift ? ", met lift" : ", zonder lift"),
      factor: a.verdieping >= 3 && !a.lift ? F.hoogZonderLift.waarden.factor : 1,
      bron: F.hoogZonderLift.bron,
    });

  let bedrag = basis;
  const factoren: FactorEffect[] = stappen.map((s) => {
    const na = bedrag * s.factor;
    const effect = na - bedrag;
    bedrag = na;
    return { ...s, effect };
  });
  const parkeren = a.parkeren === "geen" ? 0 : H.parkeren.waarden[a.parkeren];
  factoren.push({
    sleutel: "parkeren",
    naam: "Parkeren (vast bedrag per maand)",
    keuze: NAMEN.parkeren[a.parkeren],
    factor: null,
    effect: parkeren,
    bron: H.parkeren.bron,
  });
  const exact = bedrag + parkeren;

  const betrouwbaarheid = bepaalBetrouwbaarheid(w, a, regel, H, vandaag);
  const heeftBand = regel?.prijsM2Laag && regel.prijsM2Hoog && regel.prijsM2;
  const [fLaag, fHoog] = heeftBand
    ? [regel.prijsM2Laag! / regel.prijsM2, regel.prijsM2Hoog! / regel.prijsM2]
    : [1 - H.spreiding[betrouwbaarheid.niveau], 1 + H.spreiding[betrouwbaarheid.niveau]];
  const verwacht = rond5(exact);
  return {
    regel,
    vergelijking: vergelijkingsRegels(H.regels, w, a.woningtype, regel),
    bronPrijsM2,
    prijsM2: Math.round((exact / m2) * 100) / 100,
    basis,
    factoren,
    laag: rond5(bedrag * fLaag + parkeren),
    verwacht,
    hoog: rond5(bedrag * fHoog + parkeren),
    betrouwbaarheid,
    meubelNotitie: a.oplevering === "gemeubileerd" ? MEUBEL_NOTITIE : null,
  };
}

/** Betrouwbaarheid: lager bij een grover regioniveau, een oude bronregel of ontbrekende gegevens */
export function bepaalBetrouwbaarheid(
  w: HuurWoning,
  a: HuurAntwoorden,
  regel: BronRegel | null,
  H: HuurNormen,
  vandaag: string,
): BetrouwbaarheidUitleg {
  const redenen: string[] = [];
  let min = 0;
  if (!regel) {
    return {
      niveau: "laag",
      redenen: ["Geen bronregel gevonden voor deze regio; vul de referentietabel aan in Normen."],
    };
  }
  if (regel.niveau === "provincie") {
    min += 1;
    redenen.push(
      `Prijs per m² van de provincie ${regel.naam ?? regel.regio}; er is geen regel voor de gemeente.`,
    );
  } else if (regel.niveau === "land") {
    min += 2;
    redenen.push(
      "Alleen een landelijk gemiddelde; er is geen regel voor de gemeente of provincie.",
    );
  } else {
    redenen.push(`Prijs per m² van ${NIVEAU_NAMEN[regel.niveau]} ${regel.naam ?? regel.regio}.`);
  }
  const maanden = maandenTussen(regel.peildatum, vandaag);
  if (maanden > H.maxOuderdomMaanden) {
    min += 1;
    redenen.push(`De bronregel is ${maanden} maanden oud.`);
  }
  if (w.bagOppervlakte == null) {
    min += 1;
    redenen.push("Geen oppervlakte uit de BAG; de ingevulde oppervlakte is niet gecontroleerd.");
  } else if (Math.abs(a.oppervlakte - w.bagOppervlakte) > 0.15 * w.bagOppervlakte) {
    redenen.push(
      `De ingevulde oppervlakte wijkt meer dan 15% af van de BAG (${w.bagOppervlakte} m²).`,
    );
  }
  if (!a.label) {
    min += 1;
    redenen.push("Geen energielabel bekend.");
  }
  return { niveau: min === 0 ? "hoog" : min <= 2 ? "middel" : "laag", redenen };
}
