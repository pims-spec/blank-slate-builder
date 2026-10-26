import { jsPDF, type jsPDFOptions } from "jspdf";
import { autoTable } from "jspdf-autotable";
import { describe, expect, it } from "vitest";
import { normaliseerAdres } from "../portefeuille/adres";
import { PORTEFEUILLE_STANDAARD, analyseer, type AnalyseAdres } from "../portefeuille/analyse";
import {
  lijstInKolommen,
  maakPortefeuillePdf,
  opgehaaldTekst,
  zonderLabelAdressen,
} from "./portefeuille";
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

/** Niet gevonden bij EP-Online én niet in de BAG: hoort onder "Te controleren" */
const onbekend = (hn: number): AnalyseAdres => ({
  ...adres(hn, null, null, "niet_gevonden"),
  bag: { status: "niet_gevonden", oppervlakte: null, bouwjaar: null },
});

describe("PDF portefeuille-analyse", () => {
  it("samenvatting, grafiek, risico, EFG, beide lijsten en de bronvermelding, in die volgorde", async () => {
    const u = analyseer(
      [
        adres(1, "A", "2023-03-01"),
        adres(2, "C", "2016-11-20"),
        adres(3, "F", "2019-05-05"),
        onbekend(4),
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
      // niet gevonden: niet bij "zonder label", alleen onder "Te controleren"
      "Woningen zonder geregistreerd label (0)",
      "1 adres niet gevonden bij EP-Online en in de BAG; die staan onder ‘Te controleren’.",
      "Te controleren (1)",
      "1 niet gevonden (EP-Online en BAG)",
      "1053 ZD 4 Adres niet gevonden (EP-Online en BAG)",
      "Bron: EP-Online (RVO), opgehaald op 14 oktober 2026",
    ];
    // geen dubbele gegevens: eigenaar alleen op het voorblad, geen analysedatum
    const paginas = (await pdfTekst(pdf.blob)).map((x) => x.join(" ").replace(/\s+/g, " "));
    expect(paginas[0]).toContain("Eigenaar Amstel Wonen Bron EP-Online (RVO)");
    expect(paginas[0]).not.toMatch(/Adressen|Peildatum/);
    expect(paginas[0]).not.toMatch(/Portefeuille TEST Oost/);
    const rest = paginas.slice(1).join(" ");
    expect(rest).not.toContain("Amstel Wonen");
    expect(rest).toContain("Portefeuille TEST Oost");
    expect(paginas.join(" ")).not.toMatch(/Analysedatum|Datum van de analyse|Analyse per/);
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

  it("verduurzamingsraming uitgevinkt: de sectie valt weg, de rest blijft", async () => {
    const u = analyseer([adres(1, "F", "2019-05-05")], "2026-10-15", 3, PORTEFEUILLE_STANDAARD);
    const tekst = async (metRaming = true) =>
      (
        await pdfTekst(
          maakPortefeuillePdf(LIB, { portefeuille: "TEST", uitkomst: u, metRaming }).blob,
        )
      )
        .flat()
        .join(" ");
    expect(await tekst()).toContain("Verduurzamingsraming");
    const zonder = await tekst(false);
    expect(zonder).not.toContain("Verduurzamingsraming");
    expect(zonder).toContain("EFG-regels");
    expect(zonder).toContain("Risicoprofiel");
  });

  it("EFG met toelichting; te controleren als lijst met reden", async () => {
    const u = analyseer(
      [
        adres(1, "A", "2023-03-01"),
        onbekend(4),
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
      "1053 ZD 4 Adres niet gevonden (EP-Online en BAG)",
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
    expect(voorblad).not.toContain("Analysedatum");
    // adressen en peildatum alleen op pagina 2
    expect(voorblad).not.toMatch(/Adressen|Peildatum/);
    expect(voorblad).toContain("Bron EP-Online (RVO)");
    expect(voorblad).not.toContain("Eigenaar");
    expect(voorblad).not.toContain("Pagina");
    // de naam alleen als kop (na twee regels "…"), niet nog eens in de kaart
    expect(voorblad).toMatch(/LABEL-ANALYSE Portefeuille met een heel lange naam .*…/);
    expect(voorblad).not.toContain("Portefeuille Portefeuille");
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
    // voorblad: de naam van de analyse als kop en de eigenaren; de portefeuilles pas op pagina 2
    expect(p[0]).toContain("LABEL-ANALYSE Oost en West Eigenaar Amstel Wonen, Rijn Vastgoed");
    expect(p[0]).not.toMatch(/Portefeuilles|portefeuilles/);
    expect(p[1]).toContain("2 portefeuilles: Oost en West");
    // geen komma-opsomming meer, maar een lijst met elke portefeuille op een eigen regel
    expect(p[1]).not.toContain("Oost, West");
    expect(p[1]).toContain("Portefeuilles 2 (zie de lijst hieronder)");
    expect(p[1]).toContain("Portefeuilles in deze analyse (2) • Oost • West");
    expect(p[1]).toContain("Analyse Oost en West");
    expect(p[1]).not.toContain("Amstel Wonen");
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

  it("lange naam: de ondertitel in de kopregel blijft op één regel en eindigt op …", async () => {
    const namen = Array.from({ length: 12 }, (_, i) => `TEST Apricot Real Estate ${i + 1} B.V.`);
    const lang = namen.slice(0, 3).join(", ") + " en 9 andere";
    const u = analyseer([adres(1, "A", "2023-03-01")], "2026-10-15", 3, PORTEFEUILLE_STANDAARD);
    const pdf = maakPortefeuillePdf(LIB, { portefeuille: lang, delen: namen, uitkomst: u });
    const p2 = (await pdfTekst(pdf.blob))[1]!;
    const sub = p2.find((t) => t.startsWith("12 portefeuilles: "))!;
    expect(sub).toMatch(/…$/);
    expect(sub.length).toBeLessThan(("12 portefeuilles: " + lang).length);
  });

  it("elk adres maar in één lijst: zonder label (wel bekend bij EP-Online) of te controleren", async () => {
    const zonderKlasse: AnalyseAdres = {
      ...adres(5, null, null),
      resultaat: { ...adres(5, null, null).resultaat!, status: "gevonden", energieklasse: null },
    };
    const u = analyseer(
      [adres(1, "A", "2023-03-01"), zonderKlasse, onbekend(6), onbekend(7)],
      "2026-10-15",
      3,
      PORTEFEUILLE_STANDAARD,
    );
    // het risicoprofiel telt beide soorten nog als "geen geregistreerd label"
    expect(u.risico.find((r) => r.categorie === "geen_label")!.aantal).toBe(3);
    expect(zonderLabelAdressen(u)).toEqual(["1053 ZD 5"]);
    const t = (await pdfTekst(maakPortefeuillePdf(LIB, { portefeuille: "TEST", uitkomst: u }).blob))
      .slice(1)
      .flat()
      .join(" ")
      .replace(/\s+/g, " ");
    expect(t).toContain(
      "Woningen zonder geregistreerd label (1) ADRES 1053 ZD 5 Daarnaast 2 adressen niet gevonden bij EP-Online en in de BAG; die staan onder ‘Te controleren’.",
    );
    // vanaf de kop "Woningen zonder geregistreerd label (" (de raming ervoor noemt alle adressen)
    const lijsten = t.slice(t.indexOf("Woningen zonder geregistreerd label ("));
    for (const nr of ["5", "6", "7"])
      expect(lijsten.split("1053 ZD " + nr + " ").length - 1, "1053 ZD " + nr).toBe(1);
  });

  it("grafiek: staven onder de EFG-regels en 'geen' in papaya, de rest indigo", () => {
    const u = analyseer(
      [adres(1, "A", "2023-03-01"), adres(2, "F", "2019-05-05"), onbekend(4)],
      "2026-10-15",
      3,
      PORTEFEUILLE_STANDAARD,
    );
    const kleuren: string[] = [];
    // jsPDF zet setFillColor per document; een subklasse vangt de aanroepen op
    class Spion extends jsPDF {
      constructor(opties?: jsPDFOptions) {
        super(opties);
        const orig = this.setFillColor.bind(this);
        this.setFillColor = ((...k: Parameters<jsPDF["setFillColor"]>) => {
          kleuren.push(k.slice(0, 3).join(","));
          return orig(...k);
        }) as jsPDF["setFillColor"];
      }
    }
    maakPortefeuillePdf(
      { ...LIB, jsPDF: Spion as unknown as typeof jsPDF },
      { portefeuille: "TEST", uitkomst: u, metRaming: false },
    );
    // één vulkleur per staaf: F en geen in papaya
    expect(kleuren.filter((k) => k === "255,124,58")).toHaveLength(2);
    // A in indigo (de enige indigo vulling in deze PDF)
    expect(kleuren.filter((k) => k === "91,65,255")).toHaveLength(1);
  });

  it("geen label bij EP-Online maar het adres bestaat: onder 'zonder label', met BAG-opmerking", async () => {
    const nietGevonden = (
      hn: number,
      bag: NonNullable<AnalyseAdres["bag"]> | null,
    ): AnalyseAdres => ({
      ...adres(hn, null, null, "niet_gevonden"),
      bag,
    });
    const u = analyseer(
      [
        nietGevonden(1, { status: "gevonden", oppervlakte: 70, bouwjaar: 1990 }),
        nietGevonden(2, null),
        onbekend(3),
      ],
      "2026-10-15",
      3,
      PORTEFEUILLE_STANDAARD,
    );
    const t = (await pdfTekst(maakPortefeuillePdf(LIB, { portefeuille: "TEST", uitkomst: u }).blob))
      .slice(1)
      .flat()
      .join(" ")
      .replace(/\s+/g, " ");
    expect(t).toContain(
      "Woningen zonder geregistreerd label (2) ADRES 1053 ZD 1 1053 ZD 2 (BAG nog niet opgehaald) Daarnaast 1 adres niet gevonden bij EP-Online en in de BAG",
    );
    expect(t).toContain("Te controleren (1)");
    expect(t).toContain("1053 ZD 3 Adres niet gevonden (EP-Online en BAG)");
  });

  it("EFG-regels uitgevinkt: samenvattingsrij, sectie en lijst weg; in de grafiek alleen 'geen' papaya", async () => {
    const u = analyseer(
      [
        adres(1, "A", "2023-03-01"),
        adres(2, "F", "2019-05-05"),
        adres(3, null, null, "niet_gevonden"),
      ],
      "2026-10-15",
      3,
      PORTEFEUILLE_STANDAARD,
    );
    const kleuren: string[] = [];
    class Spion extends jsPDF {
      constructor(opties?: jsPDFOptions) {
        super(opties);
        const orig = this.setFillColor.bind(this);
        this.setFillColor = ((...k: Parameters<jsPDF["setFillColor"]>) => {
          kleuren.push(k.slice(0, 3).join(","));
          return orig(...k);
        }) as jsPDF["setFillColor"];
      }
    }
    const pdf = maakPortefeuillePdf(
      { ...LIB, jsPDF: Spion as unknown as typeof jsPDF },
      { portefeuille: "TEST", uitkomst: u, metEfg: false, metRaming: false },
    );
    const t = (await pdfTekst(pdf.blob)).flat().join(" ");
    expect(t).not.toMatch(/EFG/);
    expect(t).toContain("Risicoprofiel");
    expect(t).toContain("Woningen zonder geregistreerd label");
    // alleen de staaf "geen" papaya; F nu indigo
    expect(kleuren.filter((k) => k === "255,124,58")).toHaveLength(1);
    expect(kleuren.filter((k) => k === "91,65,255")).toHaveLength(2);
    // met EFG-regels (standaard) staan ze er wel
    const met = (
      await pdfTekst(maakPortefeuillePdf(LIB, { portefeuille: "TEST", uitkomst: u }).blob)
    )
      .flat()
      .join(" ");
    expect(met).toContain("Onder de EFG-regels");
    expect(met).toContain("Woningen onder de EFG-regels (1)");
  });

  it("oude opgeslagen analyse (zonder BAG-indeling): niet gevonden onder 'zonder label'", async () => {
    const { zonderLabel: _weg, ...oud } = analyseer(
      [
        adres(1, "A", "2023-03-01"),
        adres(2, null, null, "niet_gevonden"),
        adres(3, null, null, "meerdere"),
      ],
      "2026-10-15",
      3,
      PORTEFEUILLE_STANDAARD,
    );
    // zo zag een opname van vóór de BAG-indeling eruit: alle niet gevonden adressen in teControleren
    const u = { ...oud, teControleren: { ...oud.teControleren, nietGevonden: ["1053 ZD 2"] } };
    const t = (await pdfTekst(maakPortefeuillePdf(LIB, { portefeuille: "TEST", uitkomst: u }).blob))
      .slice(1)
      .flat()
      .join(" ")
      .replace(/\s+/g, " ");
    expect(t).toContain(
      "Woningen zonder geregistreerd label (1) ADRES 1053 ZD 2 (BAG niet gecontroleerd)",
    );
    expect(t).toContain("Te controleren (1)");
    expect(t).toContain("1053 ZD 3 Niet eenduidig (meerdere labels)");
    expect(t).not.toMatch(/Niet gevonden bij EP-Online|niet gevonden \(EP-Online en BAG\)/);
  });
});
