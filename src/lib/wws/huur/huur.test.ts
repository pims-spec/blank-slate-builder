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
  wozTekst,
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
  it("startwaarden: NVM/VGM NL (Q2 2026, provincies Q4 2025) en Pararius Huurmonitor Q3 2026, elk met bron en datum", () => {
    const nvm = STANDAARD_REGELS.filter((r) => r.bron.startsWith("NVM & VGM NL"));
    const par = STANDAARD_REGELS.filter((r) => r.bron.startsWith("Pararius"));
    expect(nvm).toHaveLength(20);
    expect(par.filter((r) => r.niveau === "land")).toHaveLength(3);
    expect(par.filter((r) => r.niveau === "woonplaats")).toHaveLength(37);
    expect(par.filter((r) => r.niveau === "provincie")).toHaveLength(12);
    expect(nvm.length + par.length).toBe(STANDAARD_REGELS.length);
    for (const r of nvm) {
      expect(r.url).toMatch(/^https:\/\/www\.nvm\.nl\//);
      expect(r.peildatum).toMatch(/^(2026-06-30|2025-12-31)$/);
    }
    for (const r of par) {
      expect(r.url).toMatch(/^https:\/\/www\.pararius\.nl\//);
      expect(r.peildatum).toBe("2026-09-30");
    }
    expect(new Set(STANDAARD_REGELS.map((r) => r.id)).size).toBe(STANDAARD_REGELS.length);
    expect(par.find((r) => r.regio === "Amsterdam")?.prijsM2).toBe(28.56);
  });

  it("woonplaats → gemeente → provincie → landelijk; bij gelijk niveau de recentste; juiste soort vóór 'alle'", () => {
    const R = H.regels;
    // Amsterdam: woonplaats (Pararius, Q3 2026) vóór gemeente (NVM, Q2 2026)
    const ams = woning({ plaats: "Amsterdam", gemeente: "Amsterdam", provincie: "Noord-Holland" });
    expect(zoekBronRegel(R, ams, "appartement")?.id).toBe("par-wpl-amsterdam");
    // geen woonplaatsregel: de gemeente (NVM)
    expect(zoekBronRegel(R, woning({ gemeente: "'s-Gravenhage" }), "appartement")?.id).toBe(
      "gem-den-haag",
    );
    expect(zoekBronRegel(R, woning({ plaats: "'s-Gravenhage" }), "appartement")?.naam).toBe(
      "Den Haag",
    );
    // provincie: twee bronnen, de recentste (Pararius Q3 2026)
    expect(zoekBronRegel(R, woning({ gemeente: "Ede" }), "appartement")?.id).toBe(
      "par-prov-gelderland",
    );
    expect(zoekBronRegel(R, woning({ provincie: "Fryslan" }), "tussenwoning")?.id).toBe(
      "par-prov-fryslan",
    );
    expect(zoekBronRegel(R, woning({ gemeente: "", provincie: "" }), "appartement")?.id).toBe(
      "par-nl-app",
    );
    expect(zoekBronRegel(R, woning({ gemeente: "", provincie: "" }), "hoekwoning")?.id).toBe(
      "par-nl-huis",
    );
  });

  it("vergelijking: andere bronnen voor dezelfde regio, één per bron", () => {
    const w = woning({ plaats: "Amsterdam", gemeente: "Amsterdam", provincie: "Noord-Holland" });
    const m = berekenMarkthuur(w, antwoorden(w, { woningtype: "appartement" }), H, VANDAAG);
    expect(m.regel?.id).toBe("par-wpl-amsterdam");
    expect(m.vergelijking?.map((r) => r.id)).toEqual(["gem-amsterdam"]);
    const p = berekenMarkthuur(woning({ gemeente: "Ede" }), antwoorden(woning()), H, VANDAAG);
    expect(p.vergelijking?.map((r) => r.id)).toEqual(["prov-gelderland"]);
  });

  it("opgeslagen tabel met oudere startwaarden: nieuwe bronregels erbij, verwijderde blijven weg", () => {
    const oud = STANDAARD_REGELS.filter((r) => !r.id.startsWith("par-") && r.id !== "gem-utrecht");
    const n = huurNormen({ regels: oud } as never);
    expect(n.regels.some((r) => r.id === "gem-utrecht")).toBe(false);
    expect(n.regels.filter((r) => r.id.startsWith("par-"))).toHaveLength(52);
    expect(n.startwaardenVersie).toBe(2);
    // al bijgewerkt: niets opnieuw toevoegen (een admin kan Pararius-regels verwijderen)
    const bij = huurNormen({ regels: oud, startwaardenVersie: 2 } as never);
    expect(bij.regels).toHaveLength(oud.length);
  });

  it("ongeldige regels en factoren uit de normen vallen terug op de standaard", () => {
    const n = huurNormen({
      regels: [{ id: "x" } as never, STANDAARD_REGELS[0]!],
      startwaardenVersie: 2,
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

  it("zonder WOZ en al vrije sector met de minimum-WOZ: 0, niet de laagste zoekstap", () => {
    const w = woning({ bagOppervlakte: 306 });
    const a = antwoorden(w, { oppervlakte: 306, slaapkamers: 4 });
    const c = wwsCheck(w, a, H, N);
    expect(c.segLaag).toBe("hoog");
    expect(c.wozVrijeSector).toEqual({ laag: 0, hoog: 0 });
    expect(wozTekst(c, N.grensMidden + 1)).toMatch(/al op 187 punten of meer/);
  });
});

describe("WOZ-tekst bij de WWS-check", () => {
  const tekst = (c: Partial<WwsCheck>) =>
    wozTekst(
      { segLaag: "midden", segHoog: "midden", wozVrijeSector: { laag: null, hoog: null }, ...c },
      187,
    );

  it("met een WOZ-waarde: geen tekst", () => {
    expect(tekst({ wozVrijeSector: null })).toBeNull();
  });

  it("al vrije sector: geen WOZ-bedrag, ook bij een oud record met ca. € 1.000", () => {
    const t = tekst({
      segLaag: "hoog",
      segHoog: "hoog",
      wozVrijeSector: { laag: 1000, hoog: 1000 },
    });
    expect(t).toMatch(/al op 187 punten of meer; de WOZ-waarde verandert het segment niet/);
    expect(t).not.toMatch(/€/);
  });

  it("alleen het hoge scenario al vrije sector: het bedrag voor het lage scenario", () => {
    const t = tekst({ segHoog: "hoog", wozVrijeSector: { laag: 1000, hoog: 250000 } });
    expect(t).toMatch(/In het hoge scenario komt de woning al op 187 punten of meer/);
    expect(t).toMatch(/lage scenario vanaf een WOZ-waarde van ca\. € 250\.000\./);
    expect(t).not.toMatch(/€ 1\.000/);
  });

  it("nog niet vrije sector: de bandbreedte van WOZ-waarden", () => {
    expect(tekst({ wozVrijeSector: { laag: 300000, hoog: 350000 } })).toMatch(
      /Vanaf een WOZ-waarde van ca\. € 300\.000–€ 350\.000 komt/,
    );
    expect(tekst({ wozVrijeSector: { laag: 300000, hoog: 300000 } })).toMatch(
      /ca\. € 300\.000 komt/,
    );
  });

  it("nooit vrije sector", () => {
    expect(tekst({})).toMatch(
      /Ook met een hoge WOZ-waarde komt de woning naar verwachting niet op 187 punten/,
    );
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

describe("adres uit het venster", () => {
  it("postcode en huisnummer met letter en/of toevoeging", async () => {
    const { huurAdresUit } = await import("./adres");
    expect(huurAdresUit("3511 aa", "12")).toEqual({
      postcode: "3511 AA",
      huisnummer: "12",
      huisletter: "",
      toevoeging: "",
    });
    expect(huurAdresUit("3511AA", "12 a")).toMatchObject({ huisletter: "a", toevoeging: "" });
    expect(huurAdresUit("3511AA", "12-2")).toMatchObject({ huisletter: "", toevoeging: "2" });
    expect(huurAdresUit("3511AA", "12 A 2")).toMatchObject({ huisletter: "A", toevoeging: "2" });
    expect(huurAdresUit("351AA", "12")).toBeNull();
    expect(huurAdresUit("3511AA", "A")).toBeNull();
  });
});
