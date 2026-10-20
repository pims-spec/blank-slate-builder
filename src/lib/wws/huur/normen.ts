// Huurprijsindicator (nieuw, niet in de bron): de referentietabel met prijzen per m² per regio en
// de correctiefactoren. Staat in het normen-document (normen.huurindicator) en is in Normen in te
// stellen door een admin. Ontbrekende waarden: HUUR_STANDAARD.

/** Woningtypen in de vragen; "appartement" en "studio" vallen onder de NVM-soort appartement */
export type HuurWoningtype =
  "studio" | "appartement" | "tussenwoning" | "hoekwoning" | "vrijstaand";
export const HUUR_WONINGTYPEN: readonly HuurWoningtype[] = [
  "studio",
  "appartement",
  "tussenwoning",
  "hoekwoning",
  "vrijstaand",
];
export const WONINGTYPE_NAMEN: Record<HuurWoningtype, string> = {
  studio: "Studio",
  appartement: "Appartement",
  tussenwoning: "Tussenwoning",
  hoekwoning: "Hoekwoning",
  vrijstaand: "Vrijstaande woning (of 2-onder-1-kap)",
};

/** Soort in de bronnen (NVM: appartement of woonhuis), of alle woningen samen */
export type Woningsoort = "alle" | "appartement" | "woonhuis";
export const soortVan = (t: HuurWoningtype): Exclude<Woningsoort, "alle"> =>
  t === "studio" || t === "appartement" ? "appartement" : "woonhuis";

export type RegioNiveau = "pc4" | "gemeente" | "provincie" | "land";
export const NIVEAU_NAMEN: Record<RegioNiveau, string> = {
  pc4: "postcodegebied",
  gemeente: "gemeente",
  provincie: "provincie",
  land: "landelijk",
};

/** Eén regel van de referentietabel: gemiddelde kale huur per m² per maand, vrije sector */
export interface BronRegel {
  id: string;
  niveau: RegioNiveau;
  /** PC4 ("1234"), gemeentenaam zoals PDOK hem geeft ("'s-Gravenhage"), provincienaam of "Nederland" */
  regio: string;
  /** Naam op scherm en in de PDF, als die afwijkt van `regio` (bijv. "Den Haag") */
  naam?: string;
  woningsoort: Woningsoort;
  prijsM2: number;
  prijsM2Laag?: number | null;
  prijsM2Hoog?: number | null;
  /** Gemiddelde oppervlakte bij deze prijs (m²), als de bron die noemt */
  gemOppervlakte?: number | null;
  bron: string;
  url?: string;
  /** Einde van de meetperiode, yyyy-mm-dd */
  peildatum: string;
  opmerking?: string;
}

/** Een groep correctiefactoren met de herkomst; "GoHome-inschatting" tot ze zijn geijkt */
export interface FactorGroep<K extends string> {
  waarden: Record<K, number>;
  bron: string;
}

export const GOHOME_INSCHATTING = "GoHome-inschatting (nog niet geijkt)";
export const isInschatting = (bron: string) => /^GoHome-inschatting/i.test(bron.trim());

export type LabelGroep = "aplus" | "ab" | "cd" | "efg" | "onbekend";
export type Afwerking = "basis" | "goed" | "luxe";
export type Onderhoud = "goed" | "matig";
export type Staat = "gedateerd" | "modern" | "nieuw";
export type Buiten = "geen" | "balkon" | "tuin" | "dakterras";
export type Parkeren = "geen" | "plek" | "garage";
export type Oplevering = "kaal" | "gestoffeerd" | "gemeubileerd";

export interface HuurNormen {
  regels: BronRegel[];
  /** Oppervlakte waarbij de prijs per m² geldt, als de bronregel geen gemiddelde noemt */
  referentieM2: number;
  /** Kleinere woningen hebben een hogere prijs per m²: factor (m² / referentie)^-elasticiteit */
  grootte: { elasticiteit: number; bron: string };
  factoren: {
    woningtype: FactorGroep<HuurWoningtype>;
    label: FactorGroep<LabelGroep>;
    afwerking: FactorGroep<Afwerking>;
    onderhoud: FactorGroep<Onderhoud>;
    keuken: FactorGroep<Staat>;
    badkamer: FactorGroep<Staat>;
    buiten: FactorGroep<Buiten>;
    oplevering: FactorGroep<Oplevering>;
    /** Appartement op de 3e verdieping of hoger zonder lift */
    hoogZonderLift: FactorGroep<"factor">;
  };
  /** Vast bedrag per maand bovenop de huur */
  parkeren: FactorGroep<Exclude<Parkeren, "geen">>;
  /** Bandbreedte (±) als de bronregel geen lage en hoge prijs heeft, per betrouwbaarheid */
  spreiding: Record<Betrouwbaarheid, number>;
  /** Een bronregel ouder dan dit (maanden) verlaagt de betrouwbaarheid */
  maxOuderdomMaanden: number;
  /** WWS-check: aandeel van de gebruiksoppervlakte dat vertrek is (laag en hoog scenario) */
  wws: { vertrekAandeelLaag: number; vertrekAandeelHoog: number };
}

export type Betrouwbaarheid = "hoog" | "middel" | "laag";

const NVM_Q2_2026 = {
  bron: "NVM & VGM NL, Belangrijkste huurontwikkelingen Q2 2026 (gemiddelde huurprijs per m², bestaande vrije-sectorwoningen)",
  url: "https://www.nvm.nl/api/assets/media/2hsi0enf/20260730-analyse-nvm-vgmnl-huurontwikkelingen-q2-2026-def.pdf",
  peildatum: "2026-06-30",
};
const NVM_Q4_2025 = {
  bron: "NVM & VGM NL, Belangrijkste huurontwikkelingen Q4 2025 (gemiddelde huurprijs per m² per provincie, vrije sector)",
  url: "https://www.nvm.nl/api/assets/media/hl2ldzhd/20260129-nvm-vgm-nl-belangrijkste-huurontwikkelingen-q4-2025-def.pdf",
  peildatum: "2025-12-31",
  opmerking:
    "Uit de provinciekaart in het rapport; het rapport over Q2 2026 geeft geen cijfers per provincie.",
};

/** Startwaarden: alleen wat in de NVM/VGM NL-rapporten staat, met bron en datum per regel */
export const STANDAARD_REGELS: BronRegel[] = [
  {
    id: "nl-alle",
    niveau: "land",
    regio: "Nederland",
    woningsoort: "alle",
    prijsM2: 19.32,
    ...NVM_Q2_2026,
  },
  {
    id: "nl-app",
    niveau: "land",
    regio: "Nederland",
    woningsoort: "appartement",
    prijsM2: 20.72,
    gemOppervlakte: 88,
    ...NVM_Q2_2026,
  },
  {
    id: "nl-huis",
    niveau: "land",
    regio: "Nederland",
    woningsoort: "woonhuis",
    prijsM2: 15.1,
    gemOppervlakte: 121,
    ...NVM_Q2_2026,
  },
  ...(
    [
      ["Amsterdam", "Amsterdam", 25.7],
      ["Utrecht", "Utrecht", 22.49],
      ["'s-Gravenhage", "Den Haag", 20.82],
      ["Rotterdam", "Rotterdam", 19.67],
      ["Eindhoven", "Eindhoven", 16.64],
    ] as const
  ).map(([regio, naam, prijsM2]): BronRegel => ({
    id: "gem-" + naam.toLowerCase().replace(/\W+/g, "-"),
    niveau: "gemeente",
    regio,
    ...(naam !== regio ? { naam } : {}),
    woningsoort: "alle",
    prijsM2,
    ...NVM_Q2_2026,
  })),
  ...(
    [
      ["Groningen", 14.6],
      ["Fryslân", 11.54],
      ["Drenthe", 11.43],
      ["Overijssel", 13.05],
      ["Flevoland", 17.02],
      ["Gelderland", 15.36],
      ["Utrecht", 19.21],
      ["Noord-Holland", 22.27],
      ["Zuid-Holland", 18.19],
      ["Zeeland", 13.22],
      ["Noord-Brabant", 15.74],
      ["Limburg", 13.51],
    ] as const
  ).map(([regio, prijsM2]): BronRegel => ({
    id: "prov-" + regio.toLowerCase().replace(/\W+/g, "-"),
    niveau: "provincie",
    regio,
    woningsoort: "alle",
    prijsM2,
    ...NVM_Q4_2025,
  })),
];

const g = <K extends string>(waarden: Record<K, number>): FactorGroep<K> => ({
  waarden,
  bron: GOHOME_INSCHATTING,
});

export const HUUR_STANDAARD: HuurNormen = {
  regels: STANDAARD_REGELS,
  referentieM2: 90,
  grootte: { elasticiteit: 0.25, bron: GOHOME_INSCHATTING },
  factoren: {
    woningtype: g({
      studio: 1.1,
      appartement: 1,
      tussenwoning: 0.95,
      hoekwoning: 0.97,
      vrijstaand: 1,
    }),
    label: g({ aplus: 1.04, ab: 1.02, cd: 1, efg: 0.96, onbekend: 1 }),
    afwerking: g({ basis: 0.95, goed: 1, luxe: 1.08 }),
    onderhoud: g({ goed: 1, matig: 0.95 }),
    keuken: g({ gedateerd: 0.97, modern: 1, nieuw: 1.03 }),
    badkamer: g({ gedateerd: 0.97, modern: 1, nieuw: 1.03 }),
    buiten: g({ geen: 0.97, balkon: 1, tuin: 1.03, dakterras: 1.04 }),
    oplevering: g({ kaal: 0.97, gestoffeerd: 1, gemeubileerd: 1 }),
    hoogZonderLift: g({ factor: 0.95 }),
  },
  parkeren: g({ plek: 50, garage: 100 }),
  spreiding: { hoog: 0.07, middel: 0.12, laag: 0.18 },
  maxOuderdomMaanden: 12,
  wws: { vertrekAandeelLaag: 0.75, vertrekAandeelHoog: 0.85 },
};

const positief = (x: unknown, d: number) =>
  typeof x === "number" && Number.isFinite(x) && x > 0 ? x : d;

function groep<K extends string>(
  std: FactorGroep<K>,
  eigen: Partial<FactorGroep<K>> | undefined,
): FactorGroep<K> {
  const waarden = { ...std.waarden };
  for (const k of Object.keys(waarden) as K[])
    waarden[k] = positief(eigen?.waarden?.[k], std.waarden[k]);
  return { waarden, bron: (eigen?.bron ?? "").trim() || std.bron };
}

const isRegel = (r: unknown): r is BronRegel => {
  const x = r as BronRegel;
  return (
    !!x &&
    typeof x.id === "string" &&
    ["pc4", "gemeente", "provincie", "land"].includes(x.niveau) &&
    typeof x.regio === "string" &&
    ["alle", "appartement", "woonhuis"].includes(x.woningsoort) &&
    typeof x.prijsM2 === "number" &&
    x.prijsM2 > 0 &&
    typeof x.bron === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(x.peildatum)
  );
};

/** De instellingen uit de normen, aangevuld met de standaard (ongeldige waarden → standaard) */
export function huurNormen(n: Partial<HuurNormen> | null | undefined): HuurNormen {
  const s = HUUR_STANDAARD;
  const f = n?.factoren;
  return {
    regels: Array.isArray(n?.regels) ? n.regels.filter(isRegel) : s.regels,
    referentieM2: positief(n?.referentieM2, s.referentieM2),
    grootte: {
      elasticiteit:
        typeof n?.grootte?.elasticiteit === "number" &&
        n.grootte.elasticiteit >= 0 &&
        n.grootte.elasticiteit <= 1
          ? n.grootte.elasticiteit
          : s.grootte.elasticiteit,
      bron: n?.grootte?.bron?.trim() || s.grootte.bron,
    },
    factoren: {
      woningtype: groep(s.factoren.woningtype, f?.woningtype),
      label: groep(s.factoren.label, f?.label),
      afwerking: groep(s.factoren.afwerking, f?.afwerking),
      onderhoud: groep(s.factoren.onderhoud, f?.onderhoud),
      keuken: groep(s.factoren.keuken, f?.keuken),
      badkamer: groep(s.factoren.badkamer, f?.badkamer),
      buiten: groep(s.factoren.buiten, f?.buiten),
      oplevering: groep(s.factoren.oplevering, f?.oplevering),
      hoogZonderLift: groep(s.factoren.hoogZonderLift, f?.hoogZonderLift),
    },
    parkeren: groep(s.parkeren, n?.parkeren),
    spreiding: {
      hoog: positief(n?.spreiding?.hoog, s.spreiding.hoog),
      middel: positief(n?.spreiding?.middel, s.spreiding.middel),
      laag: positief(n?.spreiding?.laag, s.spreiding.laag),
    },
    maxOuderdomMaanden: positief(n?.maxOuderdomMaanden, s.maxOuderdomMaanden),
    wws: {
      vertrekAandeelLaag: positief(n?.wws?.vertrekAandeelLaag, s.wws.vertrekAandeelLaag),
      vertrekAandeelHoog: positief(n?.wws?.vertrekAandeelHoog, s.wws.vertrekAandeelHoog),
    },
  };
}
