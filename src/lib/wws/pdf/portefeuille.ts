// PDF van de portefeuille-analyse, in de huisstijl van de andere rapporten (Inter, GoHome-kop
// en -voettekst): voorblad "Label-analyse" (zoals de voorpagina van de WWS-rapporten),
// samenvatting, staafdiagram, risicoprofiel, EFG-overzicht met korte toelichting, de lijst met
// woningen waarvan het label binnen N maanden verloopt (of verliep), de lijst met EFG-woningen, de
// woningen zonder geregistreerd label, de te controleren adressen (met reden) en de bronvermelding
// van EP-Online.
import { EFG_TOELICHTING, type AnalyseUitkomst } from "../portefeuille/analyse";
import { langeDatum, nlDatum } from "../portefeuille/datum";
import { aantal, periode } from "../portefeuille/tekst";
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
  type Doc,
  type PdfLib,
} from "./stijl";

export interface PortefeuillePdfInvoer {
  /** Naam van de portefeuille, of de titel van een gecombineerde analyse */
  portefeuille: string;
  eigenaar?: string | null;
  /** Bij een gecombineerde analyse: de namen van de portefeuilles */
  delen?: readonly string[] | null;
  uitkomst: AnalyseUitkomst;
}

const pct = (p: number) => p.toLocaleString("nl-NL", { maximumFractionDigits: 1 }) + "%";
const tijdstip = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("nl-NL", { dateStyle: "long", timeStyle: "short" }) : "–";
const dag = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("nl-NL", { dateStyle: "long" }) : "–";

/** "1 oktober 2026" of "1 t/m 15 oktober 2026" */
export function opgehaaldTekst(van: string | null, tot: string | null): string {
  if (!van) return "nog niet opgehaald";
  return periode(van, tot, dag);
}

export function maakPortefeuillePdf(lib: PdfLib, x: PortefeuillePdfInvoer) {
  return binnenTekenset(false, () => portefeuillePdf(lib, x));
}

function portefeuillePdf(lib: PdfLib, x: PortefeuillePdfInvoer) {
  const u = x.uitkomst;
  const doc = nieuwDoc(lib);
  const W = PDF_W,
    M = PDF_M;

  // voorblad; te lange waarden inkorten zodat ze in de kolom passen (90 mm)
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  const past = (t: string) => {
    const regels = doc.splitTextToSize(pdfTxt(t), 88) as string[];
    return regels.length > 1 ? regels[0]!.replace(/\s*\S{0,3}$/, "") + "…" : t;
  };
  const combi = !!x.delen && x.delen.length > 1;
  pdfVoorblad(doc, "Label-analyse", [
    [combi ? "Analyse" : "Portefeuille", past(x.portefeuille)],
    ...(combi ? ([["Portefeuilles", String(x.delen!.length)]] as [string, string][]) : []),
    ...(x.eigenaar ? ([["Eigenaar", past(x.eigenaar)]] as [string, string][]) : []),
    ["Analysedatum", langeDatum(u.datum)],
    ["Adressen", String(u.aantalAdressen)],
    // korte labels: de kolom met labels is 32 mm breed (wws-site.html)
    ["Peildatum", opgehaaldTekst(u.epOpgehaaldVan, u.epOpgehaaldTot)],
    ["Bron", "EP-Online (RVO)"],
  ]);
  doc.addPage();

  let y = pdfBanner(
    doc,
    "GoHome energielabels",
    "Portefeuille-analyse",
    (combi ? x.delen!.length + " portefeuilles: " : "Portefeuille: ") + x.portefeuille,
    "Analyse per " + langeDatum(u.datum),
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
    doc.text(regels, M, y);
    y += regels.length * grootte * 0.42 + 2;
  };

  // samenvatting
  y =
    tabel(lib, doc, {
      startY: y,
      body: [
        [combi ? "Analyse" : "Portefeuille", x.portefeuille],
        ...(combi ? [["Portefeuilles", x.delen!.join(", ")]] : []),
        ...(x.eigenaar ? [[combi ? "Eigenaren" : "Eigenaar", x.eigenaar]] : []),
        ["Datum van de analyse", langeDatum(u.datum)],
        ["Peildatum EP-Online-gegevens", opgehaaldTekst(u.epOpgehaaldVan, u.epOpgehaaldTot)],
        ["Adressen", u.aantalAdressen + " (waarvan " + u.aantalBeoordeeld + " beoordeeld)"],
        ["Venster verloopdatum", "± " + u.vensterMaanden + " maanden rond de analysedatum"],
        [
          "Onder de EFG-regels",
          aantal(u.efg.aantal, "woning", "woningen") + " (" + pct(u.efg.pct) + ")",
        ],
      ],
      theme: "plain",
      styles: { fontSize: 9.5, textColor: PDF_INK, cellPadding: 1.6 },
      columnStyles: { 0: { cellWidth: 62, textColor: PDF_MUT }, 1: { fontStyle: "bold" } },
      margin: { left: M, right: M },
    }) + 8;

  kop("Woningen per labelklasse");
  y = staafdiagram(doc, u, y) + 6;

  kop("Risicoprofiel");
  y =
    tabel(lib, doc, {
      startY: y,
      head: [["Categorie", "Aantal", "%"]],
      body: u.risico.map((r) => [r.naam, String(r.aantal), pct(r.pct)]),
      ...stijl,
      columnStyles: {
        1: { halign: "right", cellWidth: 22 },
        2: { halign: "right", cellWidth: 22 },
      },
    }) + 3;
  tekst(
    "Elke woning telt in één categorie (van boven naar beneden). Verloopdatum: 'geldig tot' van EP-Online, anders registratiedatum + 10 jaar. Verouderd: geldig, maar geregistreerd vóór " +
      nlDatum(u.instellingen.verouderdVoor) +
      " (oud energielabel of energie-index, nog niet volgens NTA 8800).",
    8,
  );
  y += 4;

  kop("EFG-regels");
  tekst(u.efg.omschrijving, 9, PDF_INK);
  tekst(EFG_TOELICHTING, 8);
  tekst(
    aantal(u.efg.aantal, "woning", "woningen") +
      " (" +
      pct(u.efg.pct) +
      " van de beoordeelde woningen)" +
      (u.efg.geenLabelApart !== null
        ? "; daarnaast " +
          aantal(u.efg.geenLabelApart, "woning", "woningen") +
          " zonder geregistreerd label."
        : "."),
    9,
    PDF_INK,
  );
  y += 4;

  kop(
    "Label verloopt of verliep binnen " +
      u.vensterMaanden +
      " maanden (" +
      u.verloopLijst.length +
      ")",
  );
  if (u.verloopLijst.length)
    y =
      tabel(lib, doc, {
        startY: y,
        head: [["Adres", "Label", "Registratie", "Verloopt", "Status"]],
        body: u.verloopLijst.map((r) => [
          r.adres,
          r.klasse,
          nlDatum(r.registratiedatum),
          nlDatum(r.verloopdatum),
          r.status,
        ]),
        ...stijl,
      }) + 8;
  else {
    tekst("Geen woningen in deze periode.");
    y += 4;
  }

  kop("Woningen onder de EFG-regels (" + u.efg.woningen.length + ")");
  if (u.efg.woningen.length)
    y =
      tabel(lib, doc, {
        startY: y,
        head: [["Adres", "Label", "Registratie"]],
        body: u.efg.woningen.map((w) => [
          w.adres,
          w.klasse ?? "geen label",
          nlDatum(w.registratiedatum),
        ]),
        ...stijl,
      }) + 8;
  else {
    tekst("Geen woningen.");
    y += 4;
  }

  // woningen zonder geregistreerd label (ook "niet gevonden" bij EP-Online); oudere opgeslagen
  // analyses hebben die lijst niet, dan alleen de niet gevonden adressen
  const geen = u.risico.find((r) => r.categorie === "geen_label");
  const zonderLabel = geen?.adressen?.map((a) => a.adres) ?? u.teControleren.nietGevonden;
  kop("Woningen zonder geregistreerd label (" + (geen?.aantal ?? zonderLabel.length) + ")");
  if (zonderLabel.length)
    y =
      tabel(lib, doc, {
        startY: y,
        head: [["Adres"]],
        body: zonderLabel.map((a) => [a]),
        ...stijl,
      }) + 8;
  else {
    tekst("Geen woningen.");
    y += 4;
  }

  const c = u.teControleren;
  const controle =
    c.nietGevonden.length + c.meerdere.length + c.fout.length + c.nietOpgehaald.length;
  if (controle) {
    kop("Te controleren (" + controle + ")");
    tekst(
      [
        c.nietGevonden.length && c.nietGevonden.length + " niet gevonden bij EP-Online",
        c.meerdere.length && c.meerdere.length + " niet eenduidig (meerdere labels)",
        c.fout.length && c.fout.length + " ophalen mislukt",
        c.nietOpgehaald.length && c.nietOpgehaald.length + " nog niet opgehaald",
      ]
        .filter(Boolean)
        .join(", ") +
        ". Niet gevonden telt in het risicoprofiel als ‘geen geregistreerd label’; de overige tellen niet mee.",
      8.5,
    );
    y =
      tabel(lib, doc, {
        startY: y,
        head: [["Adres", "Reden"]],
        body: (
          [
            [c.nietGevonden, "Niet gevonden bij EP-Online"],
            [c.meerdere, "Niet eenduidig (meerdere labels)"],
            [c.fout, "Ophalen mislukt"],
            [c.nietOpgehaald, "Nog niet opgehaald"],
          ] as const
        ).flatMap(([lijst, reden]) => lijst.map((a) => [a, reden])),
        ...stijl,
      }) + 8;
  }

  if (y > 270) {
    doc.addPage();
    y = 20;
  }
  tekst(
    "Bron: EP-Online (RVO), " +
      (u.epOpgehaaldVan
        ? "opgehaald op " + periode(u.epOpgehaaldVan, u.epOpgehaaldTot, tijdstip)
        : "nog niet opgehaald") +
      ". Indicatief overzicht; aan deze analyse kunnen geen rechten worden ontleend.",
    7.5,
  );

  voettekst(doc, 2);
  return {
    blob: doc.output("blob"),
    bestandsnaam: "Portefeuille-analyse_" + bestandsBasis(x.portefeuille) + "_" + u.datum + ".pdf",
  };
}

/** Staafdiagram met jsPDF: één kleur (paars), "geen label" grijs, aantallen boven de staven */
function staafdiagram(doc: Doc, u: AnalyseUitkomst, y0: number): number {
  const M = PDF_M,
    B = PDF_W - 2 * M,
    H = 48;
  if (y0 + H + 12 > 280) {
    doc.addPage();
    y0 = 20;
  }
  const data = u.perKlasse;
  const max = Math.max(1, ...data.map((d) => d.aantal));
  const stap = B / data.length,
    staaf = Math.min(10, stap * 0.6);
  const basis = y0 + H;
  doc.setDrawColor(...PDF_LINE);
  doc.setLineWidth(0.3);
  doc.line(M, basis, M + B, basis);
  data.forEach((d, i) => {
    const h = ((H - 8) * d.aantal) / max;
    const x = M + i * stap + (stap - staaf) / 2;
    const geen = d.klasse === "geen label";
    if (h > 0) {
      doc.setFillColor(...(geen ? ([170, 170, 190] as [number, number, number]) : PDF_PUR));
      doc.roundedRect(x, basis - h, staaf, h + 0.01, 0.8, 0.8, "F");
      doc.rect(x, basis - Math.min(h, 1), staaf, Math.min(h, 1), "F"); // rechte voet op de basislijn
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(...PDF_INK);
    doc.text(String(d.aantal), x + staaf / 2, basis - h - 1.5, { align: "center" });
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...PDF_MUT);
    doc.text(geen ? "geen" : d.klasse, M + i * stap + stap / 2, basis + 4.5, { align: "center" });
  });
  return basis + 7;
}
