import { describe, expect, it } from "vitest";
import { calc } from "../calc";
import { DEFAULT_NORMEN, type Normen } from "../normen";
import type { MonumentStatus } from "../opzoeken/monument";
import type { CoropGegevens } from "../types";
import { aanvullenUitBronnen, energieTekst, type Bronnen } from "./aanvullen";
import { leesHuurprijscheck } from "./huurprijscheck";
import {
  AALBERSESTRAAT_118,
  AMSTELKADE_12_4,
  HAARLEMMERMEERSTRAAT_139H,
} from "./huurprijscheck.fixtures";

const N = DEFAULT_NORMEN as unknown as Normen;
const VANDAAG = new Date("2026-10-28");
function lees(t: string) {
  const u = leesHuurprijscheck(t.split("\n").filter(Boolean));
  if (!u.ok) throw new Error(u.fout);
  return u;
}
const GEEN: Bronnen = { label: null, monument: null, corop: null };
const label = (klasse: string, datum = "2022-03-14", bouwjaar = 1934) => ({
  Energieklasse: klasse,
  Registratiedatum: datum + "T00:00:00",
  Geldig_tot: "2032-03-14T00:00:00",
  Bouwjaar: bouwjaar,
  Gebouwtype: "Appartement",
});
const geenMonument: MonumentStatus = {
  adres: "",
  rijksmonument: false,
  rijksmonumentNummers: [],
  gemeentelijkMonument: false,
  gezichten: [],
  voorstel: null,
};
const corop: CoropGegevens = { gemeentecode: "0363", gemeente: "Amsterdam", bouwjaar: 1934 };

describe("aanvullenUitBronnen", () => {
  it("niets opgehaald: alles blijft zoals ingelezen", () => {
    const u = lees(HAARLEMMERMEERSTRAAT_139H);
    const a = aanvullenUitBronnen(u, GEEN, N, false, VANDAAG);
    expect(a.input).toEqual(u.input);
    expect(a.meldingen).toEqual(u.meldingen);
    expect(a).toMatchObject({ aangevuld: [], labelVerschil: null });
  });

  it("zelfde label: registratiedatum erbij, de melding vervalt, punten gelijk", () => {
    const u = lees(HAARLEMMERMEERSTRAAT_139H); // Label B
    const a = aanvullenUitBronnen(u, { ...GEEN, label: label("B") }, N, false, VANDAAG);
    expect(a.input.energie).toMatchObject({ soort: "label", label: "B", datum: "2022-03-14" });
    expect(a.meldingen.join(" ")).not.toMatch(/zonder registratiedatum/);
    expect(a.aangevuld).toContain("Energielabel: Label B, geregistreerd 14-03-2022 (EP-Online).");
    expect(a.labelVerschil).toBeNull();
    expect(a.meta.bouwjaar).toBe("1934");
    expect(calc(a.input, N, { peildatum: VANDAAG }).totaal).toBe(216);
  });

  it("ander label: de Huurprijscheck blijft, tenzij EP-Online wordt aangevinkt", () => {
    const u = lees(HAARLEMMERMEERSTRAAT_139H);
    const b = { ...GEEN, label: label("A", "2025-06-01") };
    const houden = aanvullenUitBronnen(u, b, N, false, VANDAAG);
    expect(houden.labelVerschil).toEqual({
      huurprijscheck: "Label B",
      epOnline: "Label A, geregistreerd 01-06-2025",
    });
    expect(houden.input.energie).toEqual(u.input.energie);
    const nemen = aanvullenUitBronnen(u, b, N, true, VANDAAG);
    expect(nemen.input.energie).toMatchObject({ soort: "label", label: "A", datum: "2025-06-01" });
    expect(calc(nemen.input, N, { peildatum: VANDAAG }).totaal).toBeGreaterThan(216);
    // het woningtype uit EP-Online wordt niet overgenomen, alleen de energie
    expect(nemen.input.woningtype).toBe(u.input.woningtype);
  });

  it("verlopen label in EP-Online telt als ‘geen geldig label’ en is dus een verschil", () => {
    const u = lees(HAARLEMMERMEERSTRAAT_139H);
    const oud = { ...label("B", "2014-01-01"), Geldig_tot: "2024-01-01T00:00:00" };
    const a = aanvullenUitBronnen(u, { ...GEEN, label: oud }, N, false, VANDAAG);
    expect(a.labelVerschil).toEqual({
      huurprijscheck: "Label B",
      epOnline: "geen geldig label (bouwjaar 1934)",
    });
  });

  it("bouwjaar ‘1976 of eerder’: het werkelijke BAG-bouwjaar in dezelfde klasse", () => {
    const u = lees(AALBERSESTRAAT_118);
    const a = aanvullenUitBronnen(u, { ...GEEN, corop }, N, false, VANDAAG);
    expect(a.input.energie).toMatchObject({ soort: "bouwjaar", bouwjaar: 1934 });
    expect(a.labelVerschil).toBeNull();
    expect(a.aangevuld).toContain("Bouwjaar voor de energiepunten: 1934 (BAG).");
    expect(calc(a.input, N, { peildatum: VANDAAG }).totaal).toBe(132);
  });

  it("COROP-gegevens met de adressleutel, en het bouwjaar in de meta", () => {
    const u = lees(AALBERSESTRAAT_118);
    const a = aanvullenUitBronnen(u, { ...GEEN, corop }, N, false, VANDAAG);
    expect(a.input.woz.corop).toEqual({ ...corop, adres: "1067GH|118||" });
    expect(a.meta.bouwjaar).toBe("1934");
  });

  it("monument: invullen als de Huurprijscheck niets had, anders alleen melden", () => {
    const rijks = { ...geenMonument, rijksmonument: true, voorstel: "rijks" as const };
    const a = aanvullenUitBronnen(lees(AALBERSESTRAAT_118), { ...GEEN, monument: rijks }, N, false);
    expect(a.input.opslag.keuze).toBe("rijks_na");
    expect(a.meldingen.join(" ")).toMatch(/volgens het Kadaster\/RCE is dit een rijksmonument/);

    const stads = lees(AMSTELKADE_12_4); // Huurprijscheck: beschermd stadsgezicht
    const b = aanvullenUitBronnen(stads, { ...GEEN, monument: rijks }, N, false);
    expect(b.input.opslag.keuze).toBe("stads");
    expect(b.meldingen.join(" ")).toMatch(/De Huurprijscheck is overgenomen/);

    const c = aanvullenUitBronnen(stads, { ...GEEN, monument: geenMonument }, N, false);
    expect(c.input.opslag.keuze).toBe("stads");
    expect(c.meldingen.join(" ")).toMatch(/geen monumentstatus/);

    const gelijk = { ...geenMonument, gezichten: ["Amsterdam-Zuid"], voorstel: "stads" as const };
    const d = aanvullenUitBronnen(stads, { ...GEEN, monument: gelijk }, N, false);
    expect(d.aangevuld).toContain(
      "Monumentstatus gecontroleerd: beschermd stads- of dorpsgezicht (Kadaster/RCE).",
    );
  });
});

describe("energieTekst", () => {
  it.each([
    [{ soort: "label", label: "A+", indexKlasse: "", datum: "", bouwjaar: "" }, "Label A+"],
    [
      { soort: "index", label: "", indexKlasse: "3", datum: "2018-02-01", bouwjaar: "" },
      "energie-index 1,2 < EI ≤ 1,4, geregistreerd 01-02-2018",
    ],
    [
      { soort: "bouwjaar", label: "", indexKlasse: "", datum: "", bouwjaar: 1925 },
      "geen geldig label (bouwjaar 1925)",
    ],
  ] as const)("%o", (e, t) => {
    expect(energieTekst({ ...e })).toBe(t);
  });
});
