import { jsPDF } from "jspdf";
import { autoTable } from "jspdf-autotable";
import { describe, expect, it } from "vitest";
import { standaardAntwoorden, type HuurWoning } from "../huur/model";
import { huurNormen } from "../huur/normen";
import { maakHuurIndicatie } from "../huur/opslag";
import { DEFAULT_NORMEN, type Normen } from "../normen";
import { HUUR_DISCLAIMER, maakHuurPdf } from "./huur";
import { INTER, pdfTekst } from "./testhulp";

const LIB = { jsPDF, autoTable, lettertype: INTER };
const N = DEFAULT_NORMEN as unknown as Normen;
const W: HuurWoning = {
  postcode: "3511AA",
  huisnummer: "12",
  straat: "Teststraat",
  plaats: "Utrecht",
  gemeente: "Utrecht",
  provincie: "Utrecht",
  bagOppervlakte: 70,
  bouwjaar: 1968,
  gebruiksdoel: "woonfunctie",
  label: "C",
  labelDatum: "2023-03-01",
  gebouwtype: "Appartement",
};

describe("PDF huurprijsindicatie", () => {
  it("voorblad, bandbreedte, advies met reden, WWS-check, factoren, bronnen en disclaimer", async () => {
    const data = maakHuurIndicatie(
      W,
      { ...standaardAntwoorden(W), oplevering: "gemeubileerd", woz: 380000 },
      huurNormen(null),
      N,
      "Test Gebruiker",
      "2026-10-20",
    );
    const pdf = maakHuurPdf(LIB, { data, eigenaar: "Testeigenaar" });
    expect(pdf.bestandsnaam).toMatch(/^Huurprijsindicatie_.*Teststraat.*_2026-10-20\.pdf$/);
    const paginas = await pdfTekst(pdf.blob);
    const voorblad = paginas[0]!.join(" ");
    expect(voorblad).toContain("Huurprijsindicatie");
    expect(voorblad).toContain("Testeigenaar");
    const t = paginas.slice(1).flat().join(" ").replace(/\s+/g, " ");
    expect(t).toContain("Indicatie markthuur");
    expect(t).toContain("Advies huurprijs: € " + data.advies.bedrag.toLocaleString("nl-NL"));
    expect(t).toContain("laagste van markthuur en wettelijke maximale huur");
    expect(t).toContain(`${data.wws.puntenLaag} – ${data.wws.puntenHoog}`);
    expect(t).toContain("GoHome-inschatting");
    expect(t).toContain("servicekosten");
    expect(t).toMatch(/NVM & VGM NL.*peildatum 30 juni 2026/);
    expect(t).toContain(HUUR_DISCLAIMER.slice(0, 40));
  });

  it("grensgeval: 'volledige telling nodig' staat erin", async () => {
    const data = maakHuurIndicatie(
      W,
      standaardAntwoorden(W),
      huurNormen(null),
      N,
      "T",
      "2026-10-20",
    );
    data.wws = { ...data.wws, grensgeval: true, segHoog: "hoog" };
    const t = (await pdfTekst(maakHuurPdf(LIB, { data }).blob)).flat().join(" ");
    expect(t).toContain("Grensgeval: volledige telling nodig.");
  });
});
