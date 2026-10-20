import { describe, expect, it } from "vitest";
import { calc } from "../calc";
import { DEFAULT_NORMEN, type Normen } from "../normen";
import {
  berekenMarkthuur,
  globaleTelling,
  HUUR_STANDAARD,
  huurAdvies,
  huurNormen,
  isInschatting,
  MEUBEL_NOTITIE,
  standaardAntwoorden,
  STANDAARD_REGELS,
  woningtypeUitGebouwtype,
  wozVoorVrijeSector,
  wwsCheck,
  zoekBronRegel,
  type HuurAntwoorden,
  type HuurWoning,
  type WwsCheck,
} from "./index";

const N = DEFAULT_NORMEN as unknown as Normen;
const H = huurNormen(null);
const VANDAAG = "2026-10-20";

const woning = (w: Partial<HuurWoning> = {}): HuurWoning => ({
  postcode: "1234AB",
  huisnummer: "12",
  straat: "Teststraat",
  plaats: "Testdorp",
  gemeente: "Testgemeente",
  provincie: "Gelderland",
  bagOppervlakte: 80,
  bouwjaar: 1975,
  gebruiksdoel: "woonfunctie",
  label: "C",
  labelDatum: "2022-05-01",
  gebouwtype: "Tussenwoning",
  ...w,
});
const antwoorden = (w: HuurWoning, a: Partial<HuurAntwoorden> = {}): HuurAntwoorden => ({
  ...standaardAntwoorden(w),
  ...a,
});

describe("referentietabel", () => {
  it("startwaarden: landelijk, vijf steden (Q2 2026) en twaalf provincies (Q4 2025), elk met bron en datum", () => {
    expect(STANDAARD_REGELS.filter((r) => r.niveau === "land")).toHaveLength(3);
    expect(STANDAARD_REGELS.filter((r) => r.niveau === "gemeente")).toHaveLength(5);
    expect(STANDAARD_REGELS.filter((r) => r.niveau === "provincie")).toHaveLength(12);
    for (const r of STANDAARD_REGELS) {
      expect(r.bron).toMatch(/^NVM & VGM NL/);
      expect(r.url).toMatch(/^https:\/\/www\.nvm\.nl\//);
      expect(r.peildatum).toMatch(/^(2026-06-30|2025-12-31)$/);
    }
  });

  it("gemeente → provincie → landelijk; de juiste soort gaat vóór 'alle'", () => {
    const R = H.regels;
    expect(zoekBronRegel(R, woning({ gemeente: "'s-Gravenhage" }), "appartement")?.naam).toBe(
      "Den Haag",
    );
    expect(zoekBronRegel(R, woning({ gemeente: "Arnhem" }), "appartement")?.id).toBe(
      "prov-gelderland",
    );
    expect(zoekBronRegel(R, woning({ provincie: "Fryslan" }), "tussenwoning")?.id).toBe(
      "prov-frysl-n",
    );
    expect(zoekBronRegel(R, woning({ gemeente: "", provincie: "" }), "appartement")?.id).toBe(
      "nl-app",
    );
    expect(zoekBronRegel(R, woning({ gemeente: "", provincie: "" }), "hoekwoning")?.id).toBe(
      "nl-huis",
    );
  });

  it("ongeldige regels en factoren uit de normen vallen terug op de standaard", () => {
    const n = huurNormen({
      regels: [{ id: "x" } as never, STANDAARD_REGELS[0]!],
      factoren: { afwerking: { waarden: { basis: -1, goed: 1, luxe: 1.2 }, bron: "Eigen ijking" } },
    } as never);
    expect(n.regels).toHaveLength(1);
    expect(n.factoren.afwerking.waarden).toEqual({ basis: 0.95, goed: 1, luxe: 1.2 });
    expect(isInschatting(n.factoren.afwerking.bron)).toBe(false);
    expect(isInschatting(n.factoren.keuken.bron)).toBe(true);
  });
});

describe("markthuur", () => {
  it("prijs per m² × oppervlakte × factoren; de effecten tellen op tot het totaal", () => {
    const w = woning({ gemeente: "Utrecht", provincie: "Utrecht" });
    const a = antwoorden(w, {
      woningtype: "appartement",
      oppervlakte: 70,
      afwerking: "luxe",
      buiten: "balkon",
      parkeren: "plek",
    });
    const m = berekenMarkthuur(w, a, H, VANDAAG);
    expect(m.regel?.id).toBe("gem-utrecht");
    expect(m.basis).toBeCloseTo(22.49 * 70, 6);
    const som = m.basis + m.factoren.reduce((s, f) => s + f.effect, 0);
    expect(m.verwacht).toBe(Math.round(som / 5) * 5);
    expect(m.factoren.find((f) => f.sleutel === "parkeren")?.effect).toBe(50);
    expect(m.factoren.find((f) => f.sleutel === "afwerking")?.factor).toBe(1.08);
    expect(m.laag).toBeLessThan(m.verwacht);
    expect(m.hoog).toBeGreaterThan(m.verwacht);
    expect(m.betrouwbaarheid.niveau).toBe("hoog");
  });

  it("groottefactor: een kleinere woning heeft een hogere prijs per m²", () => {
    const w = woning();
    const klein = berekenMarkthuur(w, antwoorden(w, { oppervlakte: 45 }), H, VANDAAG);
    const groot = berekenMarkthuur(w, antwoorden(w, { oppervlakte: 140 }), H, VANDAAG);
    expect(klein.prijsM2).toBeGreaterThan(groot.prijsM2);
  });

  it("met een regel per soort geen extra woningtypefactor, behalve voor een studio", () => {
    const w = woning({ gemeente: "", provincie: "" });
    const app = berekenMarkthuur(w, antwoorden(w, { woningtype: "appartement" }), H, VANDAAG);
    const studio = berekenMarkthuur(w, antwoorden(w, { woningtype: "studio" }), H, VANDAAG);
    expect(app.factoren.find((f) => f.sleutel === "woningtype")?.factor).toBe(1);
    expect(studio.factoren.find((f) => f.sleutel === "woningtype")?.factor).toBeCloseTo(1.1);
  });

  it("gemeubileerd: zelfde kale huur als gestoffeerd, met de notitie over servicekosten", () => {
    const w = woning();
    const gest = berekenMarkthuur(w, antwoorden(w, { oplevering: "gestoffeerd" }), H, VANDAAG);
    const gem = berekenMarkthuur(w, antwoorden(w, { oplevering: "gemeubileerd" }), H, VANDAAG);
    expect(gem.verwacht).toBe(gest.verwacht);
    expect(gem.meubelNotitie).toBe(MEUBEL_NOTITIE);
    expect(gest.meubelNotitie).toBeNull();
  });

  it("hoog zonder lift alleen bij een appartement vanaf de 3e verdieping", () => {
    const w = woning();
    const f = (a: Partial<HuurAntwoorden>) =>
      berekenMarkthuur(
        w,
        antwoorden(w, { woningtype: "appartement", ...a }),
        H,
        VANDAAG,
      ).factoren.find((x) => x.sleutel === "lift")?.factor;
    expect(f({ verdieping: 4, lift: false })).toBe(0.95);
    expect(f({ verdieping: 2, lift: false })).toBe(1);
    expect(f({ verdieping: 4, lift: true })).toBe(1);
  });

  it("betrouwbaarheid: landelijk, oud, zonder BAG en zonder label → laag", () => {
    const w = woning({ gemeente: "", provincie: "", bagOppervlakte: null, label: null });
    const a = antwoorden(w, { label: "" });
    const m = berekenMarkthuur(w, a, H, "2028-01-01");
    expect(m.betrouwbaarheid.niveau).toBe("laag");
    expect(m.betrouwbaarheid.redenen.join(" ")).toMatch(/landelijk gemiddelde/);
    expect(m.betrouwbaarheid.redenen.join(" ")).toMatch(/maanden oud/);
    // provincie: middel; spreiding volgt de betrouwbaarheid
    const p = berekenMarkthuur(woning(), antwoorden(woning()), H, VANDAAG);
    expect(p.betrouwbaarheid.niveau).toBe("middel");
    expect(p.hoog / p.verwacht).toBeCloseTo(1 + HUUR_STANDAARD.spreiding.middel, 1);
  });

  it("gebouwtype van EP-Online → woningtype", () => {
    expect(woningtypeUitGebouwtype("Appartement")).toBe("appartement");
    expect(woningtypeUitGebouwtype("Hoekwoning")).toBe("hoekwoning");
    expect(woningtypeUitGebouwtype("Rijwoning tussen")).toBe("tussenwoning");
    expect(woningtypeUitGebouwtype("2-onder-1-kap")).toBe("vrijstaand");
    expect(woningtypeUitGebouwtype(null)).toBeNull();
  });
});

describe("WWS-check", () => {
  it("bandbreedte uit twee scenario's met de rekenkern; laag ≤ hoog", () => {
    const w = woning();
    const a = antwoorden(w, { woz: 300000 });
    const c = wwsCheck(w, a, H, N);
    expect(c.puntenLaag).toBeLessThanOrEqual(c.puntenHoog);
    expect(calc(globaleTelling(w, a, H, N, "hoog"), N).totaal).toBe(c.puntenHoog);
    expect(c.wozVrijeSector).toBeNull();
  });

  it("de globale telling gebruikt de antwoorden (label, buitenruimte, garage, WOZ)", () => {
    const w = woning();
    const x = globaleTelling(
      w,
      antwoorden(w, {
        buiten: "tuin",
        buitenM2: 40,
        parkeren: "garage",
        woz: 250000,
        slaapkamers: 3,
      }),
      H,
      N,
      "laag",
    );
    expect(x.woningtype).toBe("eengezins");
    expect(x.energie).toMatchObject({ soort: "label", label: "C" });
    expect(x.buiten.ruimten).toEqual([{ soort: "achtertuin", groep: "priv", m2: 40 }]);
    expect(x.overig.some((r) => r.type === "garage")).toBe(true);
    expect(x.vertrekken.filter((r) => r.type === "slaapkamer")).toHaveLength(3);
    expect(x.woz).toMatchObject({ soort: "woz", waarde: 250000 });
    const vertrekM2 = x.vertrekken.reduce((s, r) => s + Number(r.m2), 0);
    expect(vertrekM2).toBeCloseTo(80 * H.wws.vertrekAandeelLaag, 0);
  });

  it("zonder WOZ: de WOZ-waarde vanaf welke de woning in de vrije sector komt", () => {
    const w = woning({ bagOppervlakte: 110 });
    const a = antwoorden(w, { oppervlakte: 110, label: "A", keuken: "nieuw", badkamer: "nieuw" });
    const c = wwsCheck(w, a, H, N);
    expect(c.wozVrijeSector).not.toBeNull();
    const nodig = wozVoorVrijeSector(c.invoer, N)!;
    const met = (woz: number) =>
      calc({ ...c.invoer, woz: { ...c.invoer.woz, soort: "woz", waarde: woz } }, N).totaal;
    expect(met(nodig)).toBeGreaterThanOrEqual(N.grensMidden + 1);
    expect(met(nodig - 1000)).toBeLessThan(N.grensMidden + 1);
  });
});

describe("advies: altijd de laagste van markthuur en maximale huur", () => {
  const check = (c: Partial<WwsCheck>): WwsCheck => ({
    puntenLaag: 150,
    puntenHoog: 160,
    segLaag: "midden",
    segHoog: "midden",
    grensgeval: false,
    maxHuurLaag: 1100,
    maxHuurHoog: 1180,
    wozVrijeSector: null,
    invoer: globaleTelling(woning(), antwoorden(woning()), H, N, "hoog"),
    ...c,
  });

  it("gereguleerd en de markthuur is hoger: de maximale huur (bij de lage puntenschatting)", () => {
    const a = huurAdvies(1450, check({}), N);
    expect(a).toMatchObject({ bedrag: 1100, grond: "maximale_huur", volledigeTellingNodig: false });
    expect(a.reden).toMatch(/advies is de wettelijke maximale huur/);
  });

  it("gereguleerd en de markthuur is lager: de markthuur", () => {
    expect(huurAdvies(950, check({}), N)).toMatchObject({ bedrag: 950, grond: "markthuur" });
  });

  it("vrije sector: de markthuur, geen maximum", () => {
    const a = huurAdvies(
      1800,
      check({ puntenLaag: 190, puntenHoog: 200, segLaag: "hoog", segHoog: "hoog" }),
      N,
    );
    expect(a).toMatchObject({ bedrag: 1800, grond: "markthuur" });
    expect(a.reden).toMatch(/geen wettelijke maximale huur/);
  });

  it("grensgeval: volledige telling nodig, voorzichtig de maximale huur bij de lage schatting", () => {
    const a = huurAdvies(
      1800,
      check({
        puntenLaag: 180,
        puntenHoog: 195,
        segLaag: "midden",
        segHoog: "hoog",
        grensgeval: true,
        maxHuurLaag: 1300,
      }),
      N,
    );
    expect(a).toMatchObject({ bedrag: 1300, grond: "maximale_huur", volledigeTellingNodig: true });
    expect(a.reden).toMatch(/^Grensgeval: .*volledige telling is nodig/);
  });
});
