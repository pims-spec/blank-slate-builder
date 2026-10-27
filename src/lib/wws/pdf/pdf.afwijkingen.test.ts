// De bewuste afwijkingen van wws-site.html in de PDF's (zie de README). De vergelijkingstest
// (pdf.vergelijk.test.ts) draait met bronGetrouw: true; hier staan de afwijkingen aan.
import { jsPDF } from "jspdf";
import { autoTable } from "jspdf-autotable";
import { describe, expect, it } from "vitest";
import { adviesOpties, berekenAdvies, selectieResultaat, standaardInstellingen } from "../advies";
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
/** Een piepkleine JPEG (3 × 4 px) voor de plattegrondpagina's */
const KLEIN_JPEG =
  "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAASABIAAD/4QBARXhpZgAATU0AKgAAAAgAAYdpAAQAAAABAAAAGgAAAAAAAqACAAQAAAABAAAAA6ADAAQAAAABAAAABAAAAAD/7QA4UGhvdG9zaG9wIDMuMAA4QklNBAQAAAAAAAA4QklNBCUAAAAAABDUHYzZjwCyBOmACZjs+EJ+/+ICKElDQ19QUk9GSUxFAAEBAAACGGFwcGwEAAAAbW50clJHQiBYWVogB+YAAQABAAAAAAAAYWNzcEFQUEwAAAAAQVBQTAAAAAAAAAAAAAAAAAAAAAAAAPbWAAEAAAAA0y1hcHBsAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAKZGVzYwAAAPwAAAAwY3BydAAAASwAAABQd3RwdAAAAXwAAAAUclhZWgAAAZAAAAAUZ1hZWgAAAaQAAAAUYlhZWgAAAbgAAAAUclRSQwAAAcwAAAAgY2hhZAAAAewAAAAsYlRSQwAAAcwAAAAgZ1RSQwAAAcwAAAAgbWx1YwAAAAAAAAABAAAADGVuVVMAAAAUAAAAHABEAGkAcwBwAGwAYQB5ACAAUAAzbWx1YwAAAAAAAAABAAAADGVuVVMAAAA0AAAAHABDAG8AcAB5AHIAaQBnAGgAdAAgAEEAcABwAGwAZQAgAEkAbgBjAC4ALAAgADIAMAAyADJYWVogAAAAAAAA9tUAAQAAAADTLFhZWiAAAAAAAACD3wAAPb////+7WFlaIAAAAAAAAEq/AACxNwAACrlYWVogAAAAAAAAKDgAABELAADIuXBhcmEAAAAAAAMAAAACZmYAAPKnAAANWQAAE9AAAApbc2YzMgAAAAAAAQxCAAAF3v//8yYAAAeTAAD9kP//+6L///2jAAAD3AAAwG7/wAARCAAEAAMDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9sAQwACAgICAgIDAgIDBQMDAwUGBQUFBQYIBgYGBgYICggICAgICAoKCgoKCgoKDAwMDAwMDg4ODg4PDw8PDw8PDw8P/9sAQwECAgIEBAQHBAQHEAsJCxAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQ/90ABAAB/9oADAMBAAIRAxEAPwD947bS4YoyvmO+XdssQT8zE46dBnA9Bip/7Ph9W/T/AAq3H90/U/zp9XB6Ib3P/9k=";

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

    it("voorblad zonder adres of naam: het soort rapport één keer, als kop", async () => {
      const leeg = { ...legeMeta() };
      const blob = maakTellingPdf(LIB_HUISSTIJL, { meta: leeg, input, normen: N }).blob;
      const voorblad = (await pdfTekst(blob))[0]!.join(" ");
      expect(voorblad).toContain("Rapportage puntentelling");
      expect(voorblad).not.toContain("RAPPORTAGE PUNTENTELLING");
      expect(voorblad.match(/rapportage puntentelling/gi)).toHaveLength(1);
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
      // een rij gaat als geheel naar de volgende pagina, niet half
      expect(opts.rowPageBreak).toBe("avoid");
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

  it("adviesrapport: de vaste opties met doelzin; brongetrouw de twee oude opties", async () => {
    let getest = 0;
    for (let seed = 1; seed <= 40 && getest < 3; seed++) {
      const input = normaliseer(genereer(seed));
      const inst = standaardInstellingen(N);
      const opties = adviesOpties(input, N, inst);
      if (opties.length < 2) continue;
      const meta = willekeurigeMeta(seed);
      const tekst = (await pdfTekst(maakAdviesPdf(LIB, { meta, input, normen: N, inst }).blob))
        .flat()
        .join(" ")
        .replace(/\s+/g, " ");
      opties.forEach((o, i) => {
        expect(tekst).toContain("Optie " + (i + 1) + ": " + o.titel.toLowerCase());
        expect(tekst).toContain(o.doelzin);
        expect(tekst).toContain("Verbeteroptie " + (i + 1) + " (" + o.titel.toLowerCase() + ")");
      });
      const bron = (
        await pdfTekst(maakAdviesPdf(LIB, { meta, input, normen: N, inst, bronGetrouw: true }).blob)
      )
        .flat()
        .join(" ")
        .replace(/\s+/g, " ");
      expect(bron).toContain("Optie 1: goedkoopste en snelste route naar de vrije sector");
      expect(bron).not.toContain("Om de woning");
      getest++;
    }
    expect(getest).toBe(3);
  });

  it("route- en adviesrapport: waarschuwing als afmelden volgens het advies punten kost", async () => {
    const input = normaliseer(genereer(3));
    input.energie = {
      soort: "label",
      label: "B",
      indexKlasse: "",
      bouwjaar: "",
      datum: "2024-01-01",
    };
    input.energieAdvies = { huidig: { label: "F" }, maatregelen: [] };
    const meta = willekeurigeMeta(3);
    const inst = standaardInstellingen(N);
    const A = berekenAdvies(input, N, inst);
    const maak = {
      route: (b: boolean) =>
        maakRoutePdf(LIB, { meta, input, normen: N, advies: A, overslaan: {}, bronGetrouw: b }),
      advies: (b: boolean) => maakAdviesPdf(LIB, { meta, input, normen: N, inst, bronGetrouw: b }),
    };
    for (const m of Object.values(maak)) {
      const tekst = (await pdfTekst(m(false).blob)).flat().join(" ").replace(/\s+/g, " ");
      expect(tekst).toContain(
        "Let op: bij afmelden van het energielabel volgens het energieadvies (label F in plaats van label B)",
      );
      const bron = (await pdfTekst(m(true).blob)).flat().join(" ");
      expect(bron).not.toContain("Let op: bij afmelden");
    }
  });

  it("uitleg WOZ-cap: geldt in de vrije sector (de bron schreef 'niet in')", async () => {
    const input = normaliseer(genereer(5));
    const meta = willekeurigeMeta(5);
    const inst = standaardInstellingen(N);
    const tekst = (b: boolean) =>
      pdfTekst(maakAdviesPdf(LIB, { meta, input, normen: N, inst, bronGetrouw: b }).blob).then(
        (p) => p.flat().join(" ").replace(/\s+/g, " "),
      );
    expect(await tekst(false)).toContain(
      "WOZ-cap is alleen van kracht wanneer de woning zich in de vrije sector bevindt.",
    );
    expect(await tekst(true)).toContain("zich niet in de vrije sector bevindt");
  });

  it("adviesrapport: samenvatting onder het kopje, energielabel en WOZ op één pagina", async () => {
    const inst = standaardInstellingen(N);
    for (let n = 1; n <= 8; n++) {
      const input = normaliseer(genereer(n));
      const meta = willekeurigeMeta(n);
      const pag = await pdfTekst(maakAdviesPdf(LIB, { meta, input, normen: N, inst }).blob);
      const op = (t: string) => pag.findIndex((p) => p.includes(t));
      expect(op("Samenvatting"), "seed " + n).toBe(op("Huidige status"));
      expect(op("Hieronder is een overzicht van de punten per energielabel."), "seed " + n).toBe(
        op("Deel 2"),
      );
    }
  });

  it("voorblad: opgesteld door; adviesrapport zonder blok Woning, de puntentelling met", async () => {
    const input = normaliseer(genereer(2));
    const meta = { ...willekeurigeMeta(2), opsteller: "Test Opsteller" };
    const inst = standaardInstellingen(N);
    const advies = await pdfTekst(maakAdviesPdf(LIB, { meta, input, normen: N, inst }).blob);
    expect(advies[0]).toContain("Opgesteld door");
    expect(advies[0]).toContain("Test Opsteller");
    expect(advies.flat()).not.toContain("Bouwjaar");
    const telling = await pdfTekst(maakTellingPdf(LIB, { meta, input, normen: N }).blob);
    expect(telling[0]).toContain("Opgesteld door");
    expect(telling.flat()).toContain("Bouwjaar");
    const bron = await pdfTekst(
      maakAdviesPdf(LIB, { meta, input, normen: N, inst, bronGetrouw: true }).blob,
    );
    expect(bron[0]).not.toContain("Opgesteld door");
    expect(bron.flat()).toContain("Bouwjaar");
  });

  it("woningplattegrond: elke plattegrond op een eigen pagina, in de inhoudsopgave", async () => {
    const input = normaliseer(genereer(2));
    const meta = willekeurigeMeta(2);
    const inst = standaardInstellingen(N);
    const rapportPlattegronden = [
      { titel: "Plattegrond 1 - 2D", img: KLEIN_JPEG },
      { titel: "Plattegrond 2 - Situatie", img: KLEIN_JPEG },
    ];
    const advies = await pdfTekst(
      maakAdviesPdf(LIB, { meta, input, normen: N, inst, rapportPlattegronden }).blob,
    );
    const p1 = advies.findIndex((p) => p.includes("Plattegrond 1 - 2D"));
    const p2 = advies.findIndex((p) => p.includes("Plattegrond 2 - Situatie"));
    expect(p1).toBeGreaterThan(advies.findIndex((p) => p.includes("Deel 2")));
    expect(p2).toBe(p1 + 1);
    expect(advies.findIndex((p) => p.includes("Disclaimer"))).toBe(p2 + 1);
    expect(advies[1]!.join(" ")).toContain("Woningplattegrond");
    const telling = await pdfTekst(
      maakTellingPdf(LIB, { meta, input, normen: N, rapportPlattegronden }).blob,
    );
    expect(telling.at(-1)).toContain("Plattegrond 2 - Situatie");
    const bron = await pdfTekst(
      maakAdviesPdf(LIB, { meta, input, normen: N, inst, rapportPlattegronden, bronGetrouw: true })
        .blob,
    );
    expect(bron.flat().join(" ")).not.toContain("Plattegrond 1 - 2D");
  });

  it("adresregel: straat + huisnummer, postcode plaats (de bron zette de postcode ervoor)", async () => {
    const input = normaliseer(genereer(1));
    const meta = {
      ...legeMeta(),
      adres: "IJdoornlaan",
      huisnummer: "251T-1",
      postcode: "1024 KM",
      plaats: "Amsterdam",
    };
    const tekst = (b: boolean) =>
      pdfTekst(maakTellingPdf(LIB, { meta, input, normen: N, bronGetrouw: b }).blob).then((p) =>
        p.flat().join(" ").replace(/\s+/g, " "),
      );
    expect(await tekst(false)).toContain("IJdoornlaan 251T-1, 1024 KM Amsterdam");
    expect(await tekst(true)).toContain("IJdoornlaan, 1024 KM 251T-1, Amsterdam");
  });
});
