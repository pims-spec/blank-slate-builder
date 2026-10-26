import { jsPDF } from "jspdf";
import { autoTable } from "jspdf-autotable";
import { describe, expect, it } from "vitest";
import { normaliseerAdres } from "../portefeuille/adres";
import { PORTEFEUILLE_STANDAARD, analyseer, type AnalyseAdres } from "../portefeuille/analyse";
import { lijstInKolommen, maakPortefeuillePdf, opgehaaldTekst } from "./portefeuille";
import { INTER, pdfTekst } from "./testhulp";

const LIB = { jsPDF, autoTable, lettertype: INTER };

function adres(
  hn: number,
  klasse: string | null,
  reg: string | null,
  status = "gevonden",
): AnalyseAdres {
  const a = normaliseerAdres({ postcode: "1053ZD", huisnummer: hn });
  if (!a.ok) throw new Error();
  return {
    ...a.adres,
    id: "a" + hn,
    resultaat: {
      status: status as "gevonden",
      energieklasse: klasse,
      registratiedatum: reg,
      geldigTot: null,
      opgehaaldOp: "2026-10-14T09:00:00Z",
    },
  };
}

describe("PDF portefeuille-analyse", () => {
  it("samenvatting, grafiek, risico, EFG, beide lijsten en de bronvermelding, in die volgorde", async () => {
    const u = analyseer(
      [
        adres(1, "A", "2023-03-01"),
        adres(2, "C", "2016-11-20"),
        adres(3, "F", "2019-05-05"),
        adres(4, null, null, "niet_gevonden"),
      ],
      "2026-10-15",
      3,
      PORTEFEUILLE_STANDAARD,
    );
    const pdf = maakPortefeuillePdf(LIB, {
      portefeuille: "TEST Oost",
      eigenaar: "Amstel Wonen",
      uitkomst: u,
    });
    expect(pdf.bestandsnaam).toBe("Portefeuille-analyse_TEST_Oost_2026-10-15.pdf");
    const t = (await pdfTekst(pdf.blob)).flat().join(" ").replace(/\s+/g, " ");
    const volgorde = [
      "Portefeuille-analyse",
      "TEST Oost",
      "Amstel Wonen",
      "Datum van de analyse 15 oktober 2026",
      "Peildatum EP-Online-gegevens 14 oktober 2026",
      "Woningen per labelklasse",
      "Risicoprofiel",
      "Label verloopt binnen 3 maanden",
      "EFG-regels",
      "Woningen met label E, F of G per 1 januari 2029",
      "Label verloopt of verliep binnen 3 maanden (1)",
      "1053 ZD 2",
      "Woningen onder de EFG-regels (1)",
      "1053 ZD 3",
      "Woningen zonder geregistreerd label (1)",
      "1053 ZD 4",
      "Bron: EP-Online (RVO), opgehaald op 14 oktober 2026",
    ];
    let vanaf = 0;
    for (const stuk of volgorde) {
      const i = t.indexOf(stuk, vanaf);
      expect(i, stuk).toBeGreaterThanOrEqual(0);
      vanaf = i + 1;
    }
  });

  it("opgeslagen analyse met de oude EFG-tekst: PDF toont de huidige bewoording", async () => {
    const u = analyseer([adres(1, "F", "2019-05-05")], "2026-10-15", 3, PORTEFEUILLE_STANDAARD);
    u.efg.omschrijving =
      "Woningen met label E, F of G per 1 januari 2029 (instelling in Normen; de wettelijke invulling is nog te controleren).";
    const pdf = maakPortefeuillePdf(LIB, { portefeuille: "TEST", uitkomst: u });
    const t = (await pdfTekst(pdf.blob)).flat().join(" ").replace(/\s+/g, " ");
    expect(t).toContain("Woningen met label E, F of G per 1 januari 2029.");
    expect(t).not.toContain("instelling in Normen");
  });

  it("verduurzamingsraming: totalen en tabel per woning", async () => {
    const met = (a: AnalyseAdres, oppervlakte: number, bouwjaar: number): AnalyseAdres => ({
      ...a,
      bag: { status: "gevonden", oppervlakte, bouwjaar },
    });
    const u = analyseer(
      [met(adres(1, "F", "2019-05-05"), 60, 1980), met(adres(2, "B", "2022-01-01"), 80, 2010)],
      "2026-10-15",
      3,
      {
        ...PORTEFEUILLE_STANDAARD,
        raming: {
          ...PORTEFEUILLE_STANDAARD.raming,
          ingesteld: true,
          perM2Laag: 100,
          perM2Hoog: 150,
        },
      },
    );
    const pdf = maakPortefeuillePdf(LIB, { portefeuille: "TEST", uitkomst: u });
    // het streepje in een helvetica-regel komt uit de tekstextractie als "-"
    const t = (await pdfTekst(pdf.blob))
      .flat()
      .join(" ")
      .replace(/\s+/g, " ")
      .replace(/ - /g, " – ");
    const volgorde = [
      "Verduurzamingsraming",
      "Grove indicatie",
      "Naar minimaal label D: € 12.000 – € 18.000. Naar label C: € 18.000 – € 27.000.",
      "ADRES LABEL BOUWJAAR M² NAAR D NAAR C",
      "1053 ZD 1 F 1980 60 2 stappen, € 12.000 – € 18.000 3 stappen, € 18.000 – € 27.000",
    ];
    let vanaf = 0;
    for (const stuk of volgorde) {
      const i = t.indexOf(stuk, vanaf);
      expect(i, stuk).toBeGreaterThanOrEqual(0);
      vanaf = i + 1;
    }
    expect(t).not.toContain("1053 ZD 2 B");
  });

  it("EFG met toelichting; te controleren als lijst met reden", async () => {
    const u = analyseer(
      [
        adres(1, "A", "2023-03-01"),
        adres(4, null, null, "niet_gevonden"),
        adres(5, null, null, "meerdere"),
        adres(6, null, null, "fout"),
        { ...adres(7, null, null), resultaat: null },
      ],
      "2026-10-15",
      3,
      PORTEFEUILLE_STANDAARD,
    );
    const pdf = maakPortefeuillePdf(LIB, { portefeuille: "TEST", uitkomst: u });
    const t = (await pdfTekst(pdf.blob)).flat().join(" ").replace(/\s+/g, " ");
    const volgorde = [
      "EFG-regels",
      "Het kabinet wil dat huurwoningen",
      "Te controleren (4)",
      "ADRES REDEN",
      "1053 ZD 4 Niet gevonden bij EP-Online",
      "1053 ZD 5 Niet eenduidig (meerdere labels)",
      "1053 ZD 6 Ophalen mislukt",
      "1053 ZD 7 Nog niet opgehaald",
      "Bron: EP-Online",
    ];
    let vanaf = 0;
    for (const stuk of volgorde) {
      const i = t.indexOf(stuk, vanaf);
      expect(i, stuk).toBeGreaterThanOrEqual(0);
      vanaf = i + 1;
    }
  });

  it("voorblad 'Label-analyse' zonder voettekst; daarna de analyse met paginanummers", async () => {
    const met = (hn: number): AnalyseAdres => ({
      ...adres(hn, "E", "2020-02-02"),
      straat: "Kinkerstraat",
      woonplaats: "Amsterdam",
    });
    const u = analyseer([met(7)], "2026-10-15", 3, PORTEFEUILLE_STANDAARD);
    const lang = "Portefeuille " + "met een heel lange naam ".repeat(8);
    const pdf = maakPortefeuillePdf(LIB, { portefeuille: lang, eigenaar: null, uitkomst: u });
    const paginas = await pdfTekst(pdf.blob);
    const voorblad = paginas[0]!.join(" ").replace(/\s+/g, " ");
    expect(voorblad).toContain("GoHome");
    expect(voorblad).toContain("LABEL-ANALYSE");
    expect(voorblad).toContain("Analysedatum 15 oktober 2026");
    expect(voorblad).toContain("Adressen 1");
    expect(voorblad).toContain("Peildatum 14 oktober 2026");
    expect(voorblad).toContain("Bron EP-Online (RVO)");
    expect(voorblad).not.toContain("Eigenaar");
    expect(voorblad).not.toContain("Pagina");
    expect(voorblad).toMatch(/Portefeuille Portefeuille met een heel lange naam .*…/);
    expect(voorblad.length).toBeLessThan(lang.length + 150);
    const rest = paginas.slice(1).flat().join(" ").replace(/\s+/g, " ");
    expect(rest).toContain("Pagina 2 van " + paginas.length);
    expect(rest).toContain("Kinkerstraat 7, 1053 ZD Amsterdam");
  });

  it("gecombineerde analyse: aantal portefeuilles op het voorblad, namen in de samenvatting", async () => {
    const u = analyseer([adres(1, "A", "2023-03-01")], "2026-10-15", 3, PORTEFEUILLE_STANDAARD);
    const pdf = maakPortefeuillePdf(LIB, {
      portefeuille: "Oost en West",
      eigenaar: "Amstel Wonen, Rijn Vastgoed",
      delen: ["Oost", "West"],
      uitkomst: u,
    });
    const p = (await pdfTekst(pdf.blob)).map((x) => x.join(" ").replace(/\s+/g, " "));
    // voorblad: de naam van de analyse als kop, het aantal portefeuilles eronder
    expect(p[0]).toContain(
      "LABEL-ANALYSE Oost en West 2 portefeuilles · Amstel Wonen, Rijn Vastgoed",
    );
    expect(p[0]).toContain("Analyse Oost en West");
    expect(p[0]).toContain("Portefeuilles 2");
    expect(p[1]).toContain("2 portefeuilles: Oost en West");
    // geen komma-opsomming meer, maar een lijst met elke portefeuille op een eigen regel
    expect(p[1]).not.toContain("Oost, West");
    expect(p[1]).toContain("Portefeuilles 2 (zie de lijst hieronder)");
    expect(p[1]).toContain("Portefeuilles in deze analyse (2) • Oost • West");
    expect(p[1]).toContain("Eigenaren Amstel Wonen, Rijn Vastgoed");
    expect(pdf.bestandsnaam).toBe("Portefeuille-analyse_Oost_en_West_2026-10-15.pdf");
  });

  it("peildatum: één dag of een periode", () => {
    expect(opgehaaldTekst(null, null)).toBe("nog niet opgehaald");
    expect(opgehaaldTekst("2026-10-01T08:00:00Z", "2026-10-01T09:00:00Z")).toBe("1 oktober 2026");
    expect(opgehaaldTekst("2026-10-01T08:00:00Z", "2026-10-15T09:00:00Z")).toBe(
      "1 oktober 2026 t/m 15 oktober 2026",
    );
  });

  it("lijst met portefeuilles: tot 8 één kolom, daarboven twee kolommen van boven naar beneden", () => {
    expect(lijstInKolommen(["A", "B"])).toEqual([["A"], ["B"]]);
    const negen = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];
    expect(lijstInKolommen(negen)).toEqual([["1", "6"], ["2", "7"], ["3", "8"], ["4", "9"], ["5"]]);
  });

  it("veel portefeuilles: elke naam één keer in de lijst, ook over een pagina heen", async () => {
    const namen = Array.from({ length: 13 }, (_, i) => `TEST Apricot Real Estate ${i + 1} B.V.`);
    const u = analyseer([adres(1, "A", "2023-03-01")], "2026-10-15", 3, PORTEFEUILLE_STANDAARD);
    const pdf = maakPortefeuillePdf(LIB, {
      portefeuille: "TEST Apricot totaal",
      eigenaar: "Semper",
      delen: namen,
      uitkomst: u,
    });
    const t = (await pdfTekst(pdf.blob)).slice(1).flat().join(" ").replace(/\s+/g, " ");
    expect(t).toContain("Portefeuilles in deze analyse (13)");
    for (const n of namen) expect(t.split(n + " ").length - 1 + (t.endsWith(n) ? 1 : 0)).toBe(1);
  });
});
