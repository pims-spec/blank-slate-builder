// Een ingeladen Huurprijscheck is een gewone telling: opslaan, teruglezen en het PDF-rapport maken.
import { jsPDF } from "jspdf";
import { autoTable } from "jspdf-autotable";
import { describe, expect, it } from "vitest";
import { calc } from "../calc";
import { DEFAULT_NORMEN, type Normen } from "../normen";
import { leesTellingDoc, maakTellingDoc } from "../opslag/doc";
import { maakTellingPdf } from "../pdf/rapporten";
import { pdfTekst } from "../pdf/testhulp";
import { leesHuurprijscheck, staatUitHuurprijscheck } from "./huurprijscheck";
import { HAARLEMMERMEERSTRAAT_139H } from "./huurprijscheck.fixtures";

const N = DEFAULT_NORMEN as unknown as Normen;
const NU = new Date("2026-10-28T10:00:00Z");

function ingeladen() {
  const u = leesHuurprijscheck(HAARLEMMERMEERSTRAAT_139H.split("\n").filter(Boolean));
  if (!u.ok) throw new Error(u.fout);
  return u;
}

describe("ingeladen telling", () => {
  it("staat: meta van de Huurprijscheck, opsteller en een nieuwe telling zonder versies", () => {
    const s = staatUitHuurprijscheck(ingeladen(), "Pim", NU);
    expect(s.meta).toMatchObject({
      adres: "Haarlemmermeerstraat",
      huisnummer: "139H",
      postcode: "1058 JX",
      plaats: "Amsterdam",
      peildatum: "2026-10-20",
      opsteller: "Pim",
      klantId: "",
    });
    expect(s).toMatchObject({ versieCount: 0, basedOn: null, createdAt: NU.toISOString() });
  });

  it("overleeft opslaan en teruglezen ongewijzigd (zelfde punten)", () => {
    const s = staatUitHuurprijscheck(ingeladen(), "Pim", NU);
    const doc = maakTellingDoc(s, N, { id: "u1", naam: "Pim", email: "p@x.nl" }, NU);
    expect(doc.laatstePunten).toBe(216);
    const terug = leesTellingDoc(JSON.parse(JSON.stringify(doc)));
    expect(terug.input).toEqual(s.input);
    expect(calc(terug.input, N).totaal).toBe(216);
  });

  it("het PDF-rapport is te maken, met adres en punten", async () => {
    const s = staatUitHuurprijscheck(ingeladen(), "Pim", NU);
    const pdf = maakTellingPdf({ jsPDF, autoTable }, { meta: s.meta, input: s.input, normen: N });
    const tekst = (await pdfTekst(pdf.blob)).flat().join(" ");
    expect(tekst).toContain("Haarlemmermeerstraat 139H");
    expect(tekst).toContain("216");
    expect(tekst).toContain("Woonkamer met open keuken");
  });
});
