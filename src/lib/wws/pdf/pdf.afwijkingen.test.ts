// De bewuste afwijkingen van wws-site.html in de PDF's (zie de README). De vergelijkingstest
// (pdf.vergelijk.test.ts) draait met bronGetrouw: true; hier staan de afwijkingen aan.
import { jsPDF } from "jspdf";
import { autoTable } from "jspdf-autotable";
import { describe, expect, it } from "vitest";
import { berekenAdvies, selectieResultaat, standaardInstellingen } from "../advies";
import { normaliseer } from "../calc";
import { DEFAULT_NORMEN, type Normen } from "../normen";
import { genereer } from "../testdata";
import { maakAdviesPdf, maakRoutePdf, maakTellingPdf } from "./rapporten";
import type { CellHookData } from "jspdf-autotable";
import { legeMeta } from "../opslag/doc";
import {
  PDF_ALT,
  PDF_MUT,
  PDF_PUR,
  PDF_SOFT,
  binnenTekenset,
  huisstijlTabel,
  nieuwDoc,
  pdfTxt,
} from "./stijl";
import { INTER, bytesVan, pdfTekst, willekeurigeMeta } from "./testhulp";

const LIB = { jsPDF, autoTable };
/** Zoals in de app: met het ingesloten huisstijl-lettertype */
const LIB_HUISSTIJL = { jsPDF, autoTable, lettertype: INTER };
const N = DEFAULT_NORMEN as unknown as Normen;

/** Losse, gespatieerde letters: zo tekent jsPDF een tekst met een teken buiten zijn lettertype */
const gespatieerd = (t: string) => /^(\S ){2,}\S$/.test(t);

describe("bewuste afwijkingen in de PDF's", () => {
  it('huisstijl: Inter ingesloten, "≤" gewoon "≤" (de bron tekent losse letters)', async () => {
    const input = normaliseer(genereer(1));
    input.energie = {
      soort: "index",
      label: "",
      indexKlasse: "4",
      datum: "2018-05-01",
      bouwjaar: "",
    };
    const meta = willekeurigeMeta(1);

    const bron = (
      await pdfTekst(maakTellingPdf(LIB, { meta, input, normen: N, bronGetrouw: true }).blob)
    ).flat();
    expect(bron.some(gespatieerd), "de bron tekent losse letters").toBe(true);

    const pdf = maakTellingPdf(LIB_HUISSTIJL, { meta, input, normen: N }).blob;
    const nu = (await pdfTekst(pdf)).flat();
    expect(nu.some(gespatieerd)).toBe(false);
    expect(nu.some((t) => t.includes("1,4 < EI ≤ 1,8"))).toBe(true);
    const ruw = new TextDecoder("latin1").decode(await bytesVan(pdf));
    expect(ruw).toContain("/FontFile2"); // ingesloten TrueType
    expect(ruw).toMatch(/\/BaseFont\s*\/Inter/);
  });

  it("huisstijl: elke keuze voor helvetica (ook van autotable) wordt Inter; bron-getrouw niet", () => {
    const doc = binnenTekenset(false, () => nieuwDoc(LIB_HUISSTIJL));
    for (const [stijl, verwacht] of [
      ["normal", "normal"],
      ["bold", "bold"],
      ["italic", "normal"],
    ] as const) {
      doc.setFont("helvetica", stijl);
      expect([doc.getFont().fontName, doc.getFont().fontStyle]).toEqual(["Inter", verwacht]);
    }
    const bron = binnenTekenset(true, () => nieuwDoc(LIB_HUISSTIJL));
    bron.setFont("helvetica", "bold");
    expect(bron.getFont().fontName).toBe("helvetica");
  });

  it('zonder lettertype (laden mislukt): Helvetica, en "≤" wordt "<=" i.p.v. losse letters', async () => {
    const input = normaliseer(genereer(1));
    input.energie = {
      soort: "index",
      label: "",
      indexKlasse: "4",
      datum: "2018-05-01",
      bouwjaar: "",
    };
    const nu = (
      await pdfTekst(maakTellingPdf(LIB, { meta: willekeurigeMeta(1), input, normen: N }).blob)
    ).flat();
    expect(nu.some(gespatieerd)).toBe(false);
    expect(nu.some((t) => t.includes("1,4 < EI <= 1,8"))).toBe(true);
  });

  it("advies-PDF's: uitgangspunt (wie en wanneer) en de opties uit het energieadvies", async () => {
    const input = normaliseer(genereer(7));
    input.energie = {
      soort: "label",
      label: "F",
      indexKlasse: "",
      bouwjaar: "",
      datum: "2020-01-01",
    };
    input.energieAdvies = {
      datum: "2026-03-14",
      huidig: { label: "E" },
      maatregelen: ["C", "B", "A"].map((naar, i) => ({
        vanLabel: "E",
        naarLabel: naar,
        omschrijving: ["Optie " + naar],
        kostenMin: 5000 * (i + 1),
        kostenMax: 7000 * (i + 1),
      })),
      uitgangspunt: {
        keuze: "advies",
        label: "E",
        door: "Test Gebruiker",
        op: "2026-10-15T09:00:00Z",
      },
      gekozenOptie: 1,
    };
    const meta = willekeurigeMeta(7);
    const inst = standaardInstellingen(N);
    const A = berekenAdvies(input, N, inst);
    const pdfs = {
      route: (b = false) =>
        maakRoutePdf(LIB, { meta, input, normen: N, advies: A, overslaan: {}, bronGetrouw: b }),
      advies: (b = false) => maakAdviesPdf(LIB, { meta, input, normen: N, inst, bronGetrouw: b }),
    };
    for (const maak of Object.values(pdfs)) {
      const tekst = (await pdfTekst(maak().blob)).flat().join(" ");
      expect(tekst).toContain("Uitgangspunt verbeteradvies");
      expect(tekst).toContain("bevestigd door Test Gebruiker op 15 oktober 2026");
      expect(tekst).toContain("Opties uit het energieadvies vergeleken");
      expect(tekst).toContain("Gekozen optie: label E naar B");
      const bron = (await pdfTekst(maak(true).blob)).flat().join(" ");
      expect(bron).not.toMatch(/uitgangspunt verbeteradvies/i);
    }
  });

  it("route-PDF: eenvoudsniveau per maatregel (de bron toont het niet)", async () => {
    let getest = 0;
    for (let seed = 1; seed <= 30 && getest < 3; seed++) {
      const input = normaliseer(genereer(seed));
      const A = berekenAdvies(input, N, standaardInstellingen(N));
      const delen = A.stappen.filter((s) => s.key !== "label").flatMap((s) => s.delen);
      if (!delen.length) continue;
      const meta = willekeurigeMeta(seed);
      const tekst = (
        await pdfTekst(maakRoutePdf(LIB, { meta, input, normen: N, advies: A, overslaan: {} }).blob)
      )
        .flat()
        .join(" ");
      expect(tekst).toMatch(/\((eenvoudig|gemiddeld|lastig)\)/);
      const bron = (
        await pdfTekst(
          maakRoutePdf(LIB, { meta, input, normen: N, advies: A, overslaan: {}, bronGetrouw: true })
            .blob,
        )
      )
        .flat()
        .join(" ");
      expect(bron).not.toMatch(/\((eenvoudig|gemiddeld|lastig)\)|Niveau: /);
      getest++;
    }
    expect(getest).toBe(3);
  });

  it("route-PDF: beginsituatie en eindlabel ingevuld (geen undefined en ?)", async () => {
    let vanLabel = 0,
      vanAnders = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const input = normaliseer(genereer(seed));
      const inst = { ...standaardInstellingen(N), labelsprong: true };
      const A = berekenAdvies(input, N, inst);
      const k = A.stappen.findIndex((s) => s.key === "label");
      if (k < 0) continue;
      const meta = willekeurigeMeta(seed);
      const bron = (
        await pdfTekst(
          maakRoutePdf(LIB, { meta, input, normen: N, advies: A, overslaan: {}, bronGetrouw: true })
            .blob,
        )
      ).flat();
      expect(bron.some((t) => t.startsWith("Van undefined naar nieuw energielabel ?"))).toBe(true);

      const tekst = (
        await pdfTekst(maakRoutePdf(LIB, { meta, input, normen: N, advies: A, overslaan: {} }).blob)
      ).flat();
      expect(tekst.join(" ")).not.toContain("undefined");
      const naar = selectieResultaat(input, N, { stappen: A.stappen.slice(0, k + 1) }).input.energie
        .label;
      expect(naar).not.toBe("");
      const regel = tekst.find((t) => t.startsWith("Van "))!;
      if (input.energie.soort === "label" || input.energie.soort === "labelOud") {
        expect(regel).toBe("Van label " + input.energie.label + " naar " + naar);
        vanLabel++;
      } else {
        expect(regel).toMatch(
          new RegExp("^Van .+ naar nieuw energielabel " + naar.replace(/\+/g, "\\+") + "$"),
        );
        expect(regel).not.toContain("?");
        vanAnders++;
      }
    }
    expect(vanLabel, "route vanaf een label").toBeGreaterThan(2);
    expect(vanAnders, "route vanaf energie-index of bouwjaar").toBeGreaterThan(2);
  }, 120_000);

  describe("huisstijl GoHome UI", () => {
    const meta = {
      ...legeMeta(),
      naam: "TEST Woning",
      adres: "Damrak",
      huisnummer: "12",
      postcode: "1012AB",
      plaats: "Amsterdam",
    };
    const input = normaliseer(genereer(3));
    const pdf = (bronGetrouw: boolean) =>
      maakTellingPdf(LIB_HUISSTIJL, { meta, input, normen: N, bronGetrouw }).blob;

    it("voorblad: woordmerk, soort rapport als bovenkopje en het adres als kop", async () => {
      const nu = (await pdfTekst(pdf(false)))[0]!.join(" ");
      expect(nu).toContain("GoHome advice");
      expect(nu).toContain("RAPPORTAGE PUNTENTELLING");
      expect(nu).toContain("Damrak 12");
      expect(nu).toContain("1012 AB Amsterdam");
      const bron = (await pdfTekst(pdf(true)))[0]!.join(" ");
      expect(bron).not.toContain("advice");
      expect(bron).toContain("Rapportage puntentelling");
    });

    it("sectiekoppen gewoon gespeld en tabelkoppen in kleine hoofdletters; bron-getrouw niet", async () => {
      const nu = (await pdfTekst(pdf(false))).flat().join(" ");
      expect(nu).toContain("Punten per onderdeel");
      expect(nu).toContain("ONDERDEEL OMVAT PUNTEN");
      const bron = (await pdfTekst(pdf(true))).flat().join(" ");
      expect(bron).toContain("PUNTEN PER ONDERDEEL");
      expect(bron).toContain("Onderdeel Omvat Punten");
    });

    it("² en – blijven staan met Inter; bron-getrouw en zonder Inter 2 en -", () => {
      const met = binnenTekenset(false, () => {
        nieuwDoc(LIB_HUISSTIJL);
        return pdfTxt("31 m² – ≤");
      });
      expect(met).toBe("31 m² – ≤");
      const zonder = binnenTekenset(false, () => {
        nieuwDoc(LIB);
        return pdfTxt("31 m² – ≤");
      });
      expect(zonder).toBe("31 m2 - <=");
      const bron = binnenTekenset(true, () => {
        nieuwDoc(LIB_HUISSTIJL);
        return pdfTxt("31 m² – ≤");
      });
      expect(bron).toBe("31 m2 - ≤");
    });

    it("tabelstijl: stille kop zonder vlak, alleen haarlijnen, Frost wordt licht grijs", () => {
      const opts = huisstijlTabel({
        head: [["Ruimte", "Punten"]],
        headStyles: { fillColor: PDF_PUR, textColor: 255 },
        columnStyles: { 1: { halign: "right" } },
        didParseCell: (d: CellHookData) => {
          if (d.section === "body") d.cell.styles.fillColor = PDF_SOFT;
        },
      });
      expect(opts.theme).toBe("plain");
      const cel = (section: "head" | "body", kolom: number, text: string[]) => {
        const d = {
          section,
          column: { index: kolom },
          cell: { text, styles: { fillColor: PDF_PUR, fontSize: 9 } },
        } as unknown as CellHookData;
        opts.didParseCell!(d);
        return d.cell;
      };
      const kop = cel("head", 1, ["Punten"]);
      expect(kop.text).toEqual(["PUNTEN"]);
      expect(kop.styles).toMatchObject({
        fillColor: false,
        textColor: PDF_MUT,
        halign: "right",
        lineWidth: { bottom: 0.3 },
      });
      expect(cel("body", 0, ["Keuken"]).styles).toMatchObject({
        fillColor: PDF_ALT,
        lineWidth: { bottom: 0.2 },
      });
      // sleutel-waarde-tabellen ("plain") houden hun vorm
      const plain = huisstijlTabel({ theme: "plain", body: [["a", "b"]] });
      const d = {
        section: "body",
        column: { index: 0 },
        cell: { text: ["a"], styles: { fillColor: false } },
      } as unknown as CellHookData;
      plain.didParseCell!(d);
      expect(d.cell.styles).toEqual({ fillColor: false });
    });
  });
});
