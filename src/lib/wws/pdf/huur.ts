// PDF van een huurprijsindicatie in de huisstijl: voorblad "Huurprijsindicatie", daarna de
// bandbreedte, het advies (laagste van markthuur en maximale huur) met de reden, de WWS-check als
// bandbreedte, de invloed per factor (met "GoHome-inschatting"), de bronnen met datum en de
// disclaimer. Altijd uit een HuurIndicatieData, dus met de bronregel en factoren van toen.
import { SEGMENT_NAMEN } from "../calc";
import { isInschatting, NIVEAU_NAMEN, WONINGTYPE_NAMEN } from "../huur/normen";
import type { HuurIndicatieData } from "../huur/opslag";
import { pdfBanner, pdfVoorblad } from "./delen";
import {
  PDF_ALT,
  PDF_INK,
  PDF_LINE,
  PDF_M,
  PDF_MUT,
  PDF_PUR,
  PDF_SOFT,
  PDF_W,
  bestandsBasis,
  binnenTekenset,
  nieuwDoc,
  pdfTxt,
  tabel,
  voettekst,
  type PdfLib,
} from "./stijl";

export const HUUR_DISCLAIMER =
  "Dit is een indicatie, geen taxatie. De bedragen zijn kale huur per maand en gebaseerd op gemiddelde huurprijzen per regio en vaste correctiefactoren. De wettelijke maximale huur volgt pas zeker uit een volledige puntentelling.";

const euro = (x: number) => "€ " + Math.round(x).toLocaleString("nl-NL");
const euroCent = (x: number) =>
  "€ " + x.toLocaleString("nl-NL", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const datum = (d: string) =>
  new Date(d.length === 10 ? d + "T12:00:00Z" : d).toLocaleDateString("nl-NL", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

export interface HuurPdfInvoer {
  data: HuurIndicatieData;
  eigenaar?: string | null;
}

export function maakHuurPdf(lib: PdfLib, x: HuurPdfInvoer) {
  return binnenTekenset(false, () => huurPdf(lib, x));
}

function huurPdf(lib: PdfLib, x: HuurPdfInvoer) {
  const d = x.data;
  const w = d.woning;
  const m = d.markthuur;
  const c = d.wws;
  const adres = `${w.straat} ${w.huisnummer}`.trim();
  const pc = w.postcode.replace(/^(\d{4})([A-Z]{2})$/, "$1 $2");
  const doc = nieuwDoc(lib);
  const W = PDF_W,
    M = PDF_M;

  pdfVoorblad(doc, "Huurprijsindicatie", [
    ["Adres", adres || "–"],
    ["Plaats", `${pc} ${w.plaats}`.trim()],
    ...(x.eigenaar ? ([["Eigenaar", x.eigenaar]] as [string, string][]) : []),
    ["Datum", datum(d.datum)],
    ["Opgesteld door", d.gemaaktDoor || "–"],
    ["Markthuur", `${euro(m.laag)} – ${euro(m.hoog)}`],
    ["Advies", euro(d.advies.bedrag)],
  ]);
  doc.addPage();
  let y = pdfBanner(
    doc,
    "GoHome huurprijzen",
    "Huurprijsindicatie",
    `${adres}, ${pc} ${w.plaats}`,
    "Berekend op " + datum(d.datum),
  );

  const stijl = {
    styles: {
      fontSize: 9,
      textColor: PDF_INK,
      lineColor: PDF_LINE,
      lineWidth: 0.1,
      cellPadding: 1.8,
    },
    headStyles: { fillColor: PDF_SOFT, textColor: PDF_INK, fontStyle: "bold" as const },
    alternateRowStyles: { fillColor: PDF_ALT },
    margin: { left: M, right: M },
  };
  const kop = (t: string) => {
    if (y > 262) {
      doc.addPage();
      y = 20;
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(...PDF_INK);
    doc.text(pdfTxt(t), M, y);
    y += 6;
  };
  const tekst = (t: string, grootte = 9, kleur = PDF_MUT) => {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(grootte);
    doc.setTextColor(...kleur);
    const regels = doc.splitTextToSize(pdfTxt(t), W - 2 * M) as string[];
    if (y + regels.length * grootte * 0.42 > 278) {
      doc.addPage();
      y = 20;
    }
    doc.text(regels, M, y);
    y += regels.length * grootte * 0.42 + 2;
  };

  // de woning
  y =
    tabel(lib, doc, {
      startY: y,
      body: [
        ["Adres", `${adres}, ${pc} ${w.plaats}`],
        ["Gemeente / provincie", `${w.gemeente || "onbekend"} / ${w.provincie || "onbekend"}`],
        ["Woningtype", WONINGTYPE_NAMEN[d.antwoorden.woningtype]],
        [
          "Oppervlakte",
          `${d.antwoorden.oppervlakte} m²` +
            (w.bagOppervlakte != null ? ` (BAG: ${w.bagOppervlakte} m²)` : " (geen BAG-gegevens)"),
        ],
        ["Bouwjaar", w.bouwjaar ? String(w.bouwjaar) : "onbekend"],
        ["Energielabel", d.antwoorden.label || "onbekend"],
        ...(d.antwoorden.woz ? [["WOZ-waarde", euro(d.antwoorden.woz)]] : []),
      ],
      theme: "plain",
      styles: { fontSize: 9.5, textColor: PDF_INK, cellPadding: 1.6 },
      columnStyles: { 0: { cellWidth: 52, textColor: PDF_MUT }, 1: { fontStyle: "bold" } },
      margin: { left: M, right: M },
    }) + 6;

  // markthuur
  kop("Indicatie markthuur (kale huur per maand)");
  y =
    tabel(lib, doc, {
      startY: y,
      head: [["Laag", "Verwacht", "Hoog", "Per m²", "Betrouwbaarheid"]],
      body: [
        [
          euro(m.laag),
          euro(m.verwacht),
          euro(m.hoog),
          euroCent(m.prijsM2),
          m.betrouwbaarheid.niveau,
        ],
      ],
      ...stijl,
    }) + 3;
  for (const r of m.betrouwbaarheid.redenen) tekst("- " + r, 8.5);
  if (m.meubelNotitie) tekst(m.meubelNotitie, 8.5, PDF_INK);
  y += 3;

  // advies
  kop("Advies huurprijs: " + euro(d.advies.bedrag));
  tekst(
    "Het advies is altijd de laagste van markthuur en wettelijke maximale huur. Hier: " +
      (d.advies.grond === "markthuur" ? "de markthuur." : "de wettelijke maximale huur."),
    9,
    PDF_INK,
  );
  tekst(d.advies.reden, 9);
  y += 3;

  // WWS-check
  kop("WWS-check (globaal)");
  const vrij = c.segLaag === "hoog";
  y =
    tabel(lib, doc, {
      startY: y,
      body: [
        ["Punten (bandbreedte)", `${c.puntenLaag} – ${c.puntenHoog}`],
        [
          "Segment",
          c.grensgeval
            ? `${SEGMENT_NAMEN[c.segLaag]} of ${SEGMENT_NAMEN[c.segHoog].toLowerCase()}`
            : SEGMENT_NAMEN[c.segLaag],
        ],
        [
          "Wettelijke maximale huur",
          vrij
            ? `geen (vanaf ${d.snapshot.grensVrijeSector} punten)`
            : `${euro(Math.floor(c.maxHuurLaag))} – ${euro(Math.floor(c.maxHuurHoog))}`,
        ],
      ],
      theme: "plain",
      styles: { fontSize: 9.5, textColor: PDF_INK, cellPadding: 1.6 },
      columnStyles: { 0: { cellWidth: 52, textColor: PDF_MUT }, 1: { fontStyle: "bold" } },
      margin: { left: M, right: M },
    }) + 3;
  if (c.grensgeval) tekst("Grensgeval: volledige telling nodig.", 9.5, PDF_PUR);
  if (c.wozVrijeSector)
    tekst(
      "Zonder WOZ-waarde gerekend met de minimum-WOZ. " +
        (c.wozVrijeSector.laag != null
          ? `Vanaf een WOZ-waarde van ca. ${euro(c.wozVrijeSector.laag)}` +
            (c.wozVrijeSector.hoog != null && c.wozVrijeSector.hoog !== c.wozVrijeSector.laag
              ? ` – ${euro(c.wozVrijeSector.hoog)}`
              : "") +
            ` komt de woning naar verwachting op ${d.snapshot.grensVrijeSector} punten of meer.`
          : `Ook met een hoge WOZ-waarde komt de woning naar verwachting niet op ${d.snapshot.grensVrijeSector} punten.`),
      8.5,
    );
  tekst(
    "Globale telling in twee scenario's met de rekenkern van het woningwaarderingsstelsel; geen exact puntenaantal.",
    8,
  );
  y += 3;

  // factoren
  kop("Invloed per factor");
  y =
    tabel(lib, doc, {
      startY: y,
      head: [["Factor", "Keuze", "Factor", "Effect p/m", "Herkomst"]],
      body: [
        [
          "Basis: prijs per m² × oppervlakte",
          euroCent(m.bronPrijsM2) + " per m²",
          "",
          euro(m.basis),
          "zie bronnen",
        ],
        ...m.factoren.map((f) => [
          f.naam,
          f.keuze,
          f.factor == null
            ? "vast"
            : f.factor.toLocaleString("nl-NL", { maximumFractionDigits: 3 }),
          (f.effect > 0.5 ? "+ " : f.effect < -0.5 ? "- " : "") + euro(Math.abs(f.effect)),
          isInschatting(f.bron) ? "GoHome-inschatting" : f.bron,
        ]),
        ["Verwacht (afgerond op € 5)", "", "", euro(m.verwacht), ""],
      ],
      ...stijl,
      columnStyles: {
        2: { halign: "right", cellWidth: 16 },
        3: { halign: "right", cellWidth: 24 },
        4: { cellWidth: 34 },
      },
    }) + 3;
  tekst(
    "GoHome-inschatting: een startwaarde voor de correctiefactor, nog niet geijkt met gemeten huren.",
    8,
  );
  y += 3;

  // bronnen
  kop("Bronnen");
  const r = m.regel;
  tekst(
    r
      ? `Prijs per m² (${NIVEAU_NAMEN[r.niveau]} ${r.naam ?? r.regio}, ${r.woningsoort === "alle" ? "alle woningtypen" : r.woningsoort + "en"}): ${euroCent(r.prijsM2)}. Bron: ${r.bron}, peildatum ${datum(r.peildatum)}.` +
          (r.url ? " " + r.url : "") +
          (r.opmerking ? " " + r.opmerking : "")
      : "Geen bronregel voor deze regio.",
    8.5,
    PDF_INK,
  );
  tekst(
    "Woninggegevens: PDOK Locatieserver en BAG (Kadaster). Energielabel: EP-Online (RVO). Maximale huur: woningwaarderingsstelsel en huurprijstabel (normen " +
      d.snapshot.normenVersie +
      ").",
    8,
  );
  y += 4;
  tekst(HUUR_DISCLAIMER, 8.5, PDF_INK);

  voettekst(doc, 2);
  return {
    blob: doc.output("blob"),
    bestandsnaam:
      "Huurprijsindicatie_" + bestandsBasis(`${adres} ${w.plaats}`) + "_" + d.datum + ".pdf",
  };
}
