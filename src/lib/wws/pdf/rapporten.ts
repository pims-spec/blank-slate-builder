// De vier PDF-rapporten uit wws-site.html: makePdf() (puntentelling), makeRoutePdf() (route naar
// de vrije sector), makeAdviesVolledigPdf() (huidig + twee opties) en makeDashboardPdf().
// Elk geeft een Blob en de bestandsnaam terug; downloaden gebeurt in de UI (bewaarBestand).
// pdf.vergelijk.test.ts vergelijkt de tekst van deze PDF's met die van de originele functies.
import {
  berekenRoute,
  energieVanOmschrijving,
  selectieResultaat,
  type AdviesInstellingen,
  type AdviesResultaat,
} from "../advies";
import { eur, fmt } from "../basis";
import { calc } from "../calc";
import type { Dashboard } from "../dashboard";
import type { Normen } from "../normen";
import { weergaveAdres } from "../opslag/doc";
import type { TellingMeta } from "../opslag/types";
import type { WwsInput, WwsResultaat } from "../types";
import {
  pdfBanner,
  pdfCoverPage,
  pdfEnergieUitlegPagina,
  pdfInvoer,
  pdfOptiePagina,
  pdfPlattegrondBlok,
  pdfSamenvattingPagina,
  pdfTellingBody,
  pdfVerduurzamingPagina,
  type PdfRoute,
} from "./delen";
import {
  PDF_ALT,
  PDF_INK,
  PDF_LINE,
  PDF_M,
  PDF_MUT,
  PDF_PUR,
  PDF_SEGC,
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

export interface PdfBestand {
  blob: Blob;
  bestandsnaam: string;
}

const vandaagLang = () => new Date().toLocaleDateString("nl-NL", { dateStyle: "long" });
const naamVan = (meta: TellingMeta, anders: string) => meta.naam || weergaveAdres(meta) || anders;

/** Disclaimertekst onderaan; de route- en adviesrapporten voegen de kosten-uitleg toe */
const DISC_BASIS = (normen: Normen) =>
  "Gebruikte normen: " +
  normen.naam +
  ". Berekend volgens het beleidsboek van de Huurcommissie; aan deze telling kunnen geen rechten worden ontleend.";
const DISC_ADVIES =
  " De kosten en besparingen van de maatregelen zijn indicatieve ramingen, geen offertes. Bij een zittende huurder verandert het huurcontract niet vanzelf mee. Een renovatie kan ook de WOZ-waarde verhogen; dat is niet meegerekend.";

// ---------- puntentelling ----------

export interface TellingPdfInvoer {
  /** Zonder de bewuste afwijkingen, precies als wws-site.html (alleen voor de vergelijkingstests) */
  bronGetrouw?: boolean;
  meta: TellingMeta;
  input: WwsInput;
  normen: Normen;
  /** Vastgelegde versie; leeg = werkversie */
  versie?: { nr: number; createdAt: string; notitie?: string } | null;
  /** Plattegrond als JPEG data-URL (fase 4c) */
  plattegrond?: string | null;
}

/** Rapportage puntentelling — makePdf() */
export function maakTellingPdf(lib: PdfLib, x: TellingPdfInvoer): PdfBestand {
  return binnenTekenset(x.bronGetrouw, () => tellingPdf(lib, x));
}
function tellingPdf(lib: PdfLib, x: TellingPdfInvoer): PdfBestand {
  const { meta, normen, versie } = x;
  const input = pdfInvoer(x.input);
  const doc = nieuwDoc(lib);
  const W = PDF_W,
    M = PDF_M,
    MUT = PDF_MUT;
  const txt = pdfTxt;
  pdfCoverPage(doc, meta, "Rapportage puntentelling");
  doc.addPage();
  const dateText = versie
    ? "Versie " +
      versie.nr +
      "  |  " +
      new Date(versie.createdAt).toLocaleString("nl-NL", { dateStyle: "long", timeStyle: "short" })
    : "Werkversie, niet vastgelegd  |  " + vandaagLang();
  let y = pdfBanner(
    doc,
    "WWS-puntentelling",
    naamVan(meta, "Puntentelling"),
    "Puntentelling volgens het Woningwaarderingsstelsel, zelfstandige woonruimte",
    dateText,
  );
  if (versie && versie.notitie) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...MUT);
    doc.text(doc.splitTextToSize(txt(versie.notitie), W - 2 * M), M, y);
    y += 6;
  }
  y = pdfPlattegrondBlok(doc, y, x.plattegrond);
  const body = pdfTellingBody(lib, doc, y, meta, input, normen);
  y = body.y;
  const R = body.R;
  if (y > 258) {
    doc.addPage();
    y = 20;
  }
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(...MUT);
  const disc =
    DISC_BASIS(normen) + (R.warn.length ? " Opmerkingen: " + R.warn.map(txt).join(" ") : "");
  doc.text(doc.splitTextToSize(disc, W - 2 * M), M, y);
  voettekst(doc, 2);
  const base = bestandsBasis(naamVan(meta, "puntentelling"));
  return {
    blob: doc.output("blob"),
    bestandsnaam: "WWS_" + base + (versie ? "_v" + versie.nr : "_werkversie") + ".pdf",
  };
}

// ---------- route naar de vrije sector ----------

export interface RoutePdfInvoer {
  /** Zonder de bewuste afwijkingen, precies als wws-site.html (alleen voor de vergelijkingstests) */
  bronGetrouw?: boolean;
  meta: TellingMeta;
  input: WwsInput;
  normen: Normen;
  advies: AdviesResultaat;
  /** Niet-aangevinkte stappen in het adviesdialoog */
  overslaan: Readonly<Record<number, boolean>>;
  plattegrond?: string | null;
}

/** Huidige situatie, de gekozen route en de nieuwe situatie — makeRoutePdf() */
export function maakRoutePdf(lib: PdfLib, x: RoutePdfInvoer): PdfBestand {
  return binnenTekenset(x.bronGetrouw, () => routePdf(lib, x));
}
function routePdf(lib: PdfLib, x: RoutePdfInvoer): PdfBestand {
  const { meta, normen: N, advies: A } = x;
  const cur = pdfInvoer(x.input);
  const S = selectieResultaat(x.input, N, A, x.overslaan);
  const doc = nieuwDoc(lib);
  const W = PDF_W,
    M = PDF_M,
    MUT = PDF_MUT;
  const vandaag = vandaagLang();
  pdfCoverPage(doc, meta);
  doc.addPage();

  // Sectie 1: huidige situatie
  let y = pdfBanner(
    doc,
    "WWS-rapport",
    "Huidige situatie",
    "Puntentelling volgens het Woningwaarderingsstelsel, zelfstandige woonruimte",
    vandaag,
  );
  y = pdfPlattegrondBlok(doc, y, x.plattegrond);
  const body1 = pdfTellingBody(lib, doc, y, meta, cur, N);
  const R1 = body1.R;

  // Sectie 2: de route zoals die in het adviesdialoog is samengesteld (aangevinkte maatregelen)
  const chosen = A.stappen.filter((_g, k) => !x.overslaan[k]);
  const route: PdfRoute = {
    start: A.start,
    eind: S.R,
    stappen: chosen,
    doel: A.doel,
    gehaald: S.R.totaal >= A.doel,
    kosten: S.kosten,
    input: S.input,
    vanLabel: cur.energie.label,
  };
  if (!x.bronGetrouw) routeAanvullen(route, cur, chosen, N);
  ({ y } = pdfOptiePagina(
    lib,
    doc,
    N,
    1,
    "Advies: route naar de vrije sector",
    "De gekozen maatregelen om de woning in de vrije sector te krijgen",
    route,
    "Advies",
  ));

  // Sectie 3: nieuwe situatie, na de gekozen maatregelen
  doc.addPage();
  y = pdfBanner(
    doc,
    "WWS-rapport",
    "Nieuwe situatie (na advies)",
    "Puntentelling volgens het Woningwaarderingsstelsel, zelfstandige woonruimte",
    vandaag,
  );
  const body2 = pdfTellingBody(lib, doc, y, meta, S.input, N);
  const R2 = body2.R;
  y = body2.y;

  if (y > 258) {
    doc.addPage();
    y = 20;
  }
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(...MUT);
  const disc =
    DISC_BASIS(N) +
    DISC_ADVIES +
    (R1.warn.length || R2.warn.length
      ? " Opmerkingen: " + R1.warn.concat(R2.warn).map(pdfTxt).join(" ")
      : "");
  doc.text(doc.splitTextToSize(disc, W - 2 * M), M, y);
  voettekst(doc, 2);
  const base = bestandsBasis(naamVan(meta, "woning"));
  return { blob: doc.output("blob"), bestandsnaam: "Route_vrije_sector_" + base + ".pdf" };
}

/**
 * Bewuste afwijkingen in de route-PDF. De bron gaf de route geen beginsituatie mee (de
 * energiekaart toonde "Van undefined naar …") en het adviesdialoog houdt geen eindlabel per stap
 * bij ("… naar nieuw energielabel ?"). Hier worden beide aangevuld, zoals berekenRoute() dat
 * voor het adviesrapport al doet.
 */
export function routeAanvullen(
  route: PdfRoute,
  cur: WwsInput,
  chosen: AdviesResultaat["stappen"],
  N: Normen,
) {
  route.origSoort = cur.energie.soort;
  route.vanOmschrijving = energieVanOmschrijving(cur.energie);
  route.stappen = chosen.map((g, i) =>
    g.key === "label"
      ? {
          ...g,
          // het label na deze stap: alle gekozen stappen t/m deze toegepast
          naarLabel: selectieResultaat(cur, N, { stappen: chosen.slice(0, i + 1) }).input.energie
            .label,
        }
      : g,
  );
}

// ---------- volledig adviesrapport ----------

export interface AdviesPdfInvoer {
  /** Zonder de bewuste afwijkingen, precies als wws-site.html (alleen voor de vergelijkingstests) */
  bronGetrouw?: boolean;
  meta: TellingMeta;
  input: WwsInput;
  normen: Normen;
  /** De instellingen uit het adviesdialoog (kosten, uitgesloten maatregelen, marge, …) */
  inst: AdviesInstellingen;
  plattegrond?: string | null;
}

/** Huidige situatie plus twee verbeteropties — makeAdviesVolledigPdf() */
export function maakAdviesPdf(lib: PdfLib, x: AdviesPdfInvoer): PdfBestand {
  return binnenTekenset(x.bronGetrouw, () => adviesPdf(lib, x));
}
function adviesPdf(lib: PdfLib, x: AdviesPdfInvoer): PdfBestand {
  const { meta, normen: N, inst } = x;
  const cur = pdfInvoer(x.input);
  const doc = nieuwDoc(lib);
  const M = PDF_M,
    W = PDF_W,
    MUT = PDF_MUT;
  const vandaag = vandaagLang();
  pdfCoverPage(doc, meta);

  // Optie 1: goedkoopste route naar de vrije sector; optie 2: met marge (standaard 4 punten),
  // of anders de maximaal haalbare route. Optie 2 bouwt voort op optie 1.
  const margeGewenst = inst.marge > 0 ? inst.marge : 4;
  const doel1 = N.grensMidden + 1;
  const doel2 = N.grensMidden + 1 + margeGewenst;
  const route1 = berekenRoute(x.input, N, inst, doel1);
  let route2 = berekenRoute(x.input, N, inst, doel2, route1);
  let titel2 = "Optie 2: route met marge naar de vrije sector",
    sub2 =
      "De maatregelen van optie 1, aangevuld tot een marge van " +
      margeGewenst +
      " punten boven de grens van de vrije sector";
  if (!route2.gehaald) {
    route2 = berekenRoute(x.input, N, inst, 9999, route1);
    route2.doel = route2.eind.totaal;
    route2.gehaald = true;
    titel2 = "Optie 2: maximaal haalbare route";
    sub2 =
      "Optie 1, aangevuld met alle overige beschikbare maatregelen, voor het hoogst haalbare puntentotaal";
  }

  // Inhoudsopgave en samenvatting met de drie puntentotalen
  const Rcur = calc(cur, N);
  const sections = [
    "Huidige situatie, met de volledige puntentelling",
    "Verbeteroptie 1, met maatregelen en de volledige puntentelling",
    "Verbeteroptie 2, met maatregelen en de volledige puntentelling",
  ];
  if (cur.energieAdvies) sections.push("Verduurzamingsopties");
  sections.push("Energielabel en WOZ-waarde");
  pdfSamenvattingPagina(doc, meta, cur, N, Rcur, route1, route2, sections, x.plattegrond);

  // Huidige situatie
  doc.addPage();
  let y = pdfBanner(
    doc,
    "WWS-rapport",
    "Huidige situatie",
    "Puntentelling volgens het Woningwaarderingsstelsel, zelfstandige woonruimte",
    vandaag,
  );
  y = pdfPlattegrondBlok(doc, y, x.plattegrond);
  const body1 = pdfTellingBody(lib, doc, y, meta, cur, N);
  const R1 = body1.R;

  // De twee opties, elk met hun eigen volledige puntentelling
  let R2: WwsResultaat | null = null,
    R3: WwsResultaat | null = null;
  ({ y, R: R2 } = pdfOptiePagina(
    lib,
    doc,
    N,
    1,
    "Optie 1: goedkoopste en snelste route naar de vrije sector",
    "De meest kosteneffectieve maatregelen om net in de vrije sector te komen",
    route1,
    undefined,
    meta,
  ));
  ({ y, R: R3 } = pdfOptiePagina(lib, doc, N, 2, titel2, sub2, route2, undefined, meta));

  // Verduurzamingsopties uit een geüpload advies (optioneel)
  if (cur.energieAdvies) pdfVerduurzamingPagina(lib, doc, cur.energieAdvies);

  // Altijd: uitleg energielabel en WOZ-waarde
  pdfEnergieUitlegPagina(doc, N);

  // Disclaimer, op een eigen pagina
  doc.addPage();
  y = 20;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(...PDF_PUR);
  doc.text("DISCLAIMER", M, y);
  y += 8;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(...MUT);
  const allWarn = [...new Set(R1.warn.concat(R2 ? R2.warn : []).concat(R3 ? R3.warn : []))];
  const disc =
    DISC_BASIS(N) +
    DISC_ADVIES +
    (allWarn.length ? " Opmerkingen: " + allWarn.map(pdfTxt).join(" ") : "");
  doc.text(doc.splitTextToSize(disc, W - 2 * M), M, y);
  voettekst(doc, 2);
  const base = bestandsBasis(naamVan(meta, "puntentelling"));
  return { blob: doc.output("blob"), bestandsnaam: "WWS_" + base + "_huidig_advies_opties.pdf" };
}

// ---------- dashboard ----------

export interface DashboardPdfInvoer {
  /** Zonder de bewuste afwijkingen, precies als wws-site.html (alleen voor de vergelijkingstests) */
  bronGetrouw?: boolean;
  S: Dashboard;
  normen: Normen;
  /** Gekozen eigenaar (klant); leeg = alle eigenaren */
  klantId: string;
  klantNaam: string;
  /** Werkverdeling per collega alleen voor beheerders */
  isAdmin: boolean;
  eigenaarNaam: (ownerId: string) => string;
}

/** Portefeuille-rapportage — makeDashboardPdf(). null als er niets te exporteren is. */
export function maakDashboardPdf(lib: PdfLib, x: DashboardPdfInvoer): PdfBestand | null {
  return binnenTekenset(x.bronGetrouw, () => dashboardPdf(lib, x));
}
function dashboardPdf(lib: PdfLib, x: DashboardPdfInvoer): PdfBestand | null {
  const { S, normen: N, klantId } = x;
  const klantTxt = klantId ? x.klantNaam : "Alle eigenaren";
  if (!S.totaal) return null;
  const doc = nieuwDoc(lib);
  const W = PDF_W,
    M = PDF_M,
    INK = PDF_INK,
    MUT = PDF_MUT,
    SOFT = PDF_SOFT,
    ALT = PDF_ALT,
    LINE = PDF_LINE,
    SEGC = PDF_SEGC;
  let y = pdfBanner(
    doc,
    "GoHome dashboard",
    "Portefeuille-rapportage",
    "Eigenaar: " + klantTxt,
    vandaagLang(),
  );

  y =
    tabel(lib, doc, {
      startY: y,
      head: [["Kengetal", "Waarde"]],
      body: [
        ["Tellingen in de portefeuille", String(S.totaal)],
        ["Gemiddeld aantal punten", S.gemPunten != null ? fmt(S.gemPunten, 1) : "–"],
        [
          "Al in de vrije sector (vanaf " + (S.grensMidden + 1) + " punten)",
          String(S.vrijeSector.length),
        ],
        [
          "Net onder de grens (binnen " + S.marge + " punten van " + S.grensMidden + ")",
          String(S.nabijGrens.length),
        ],
        [
          "Al behaalde huurstijging per maand, door hertellingen" +
            (S.behaaldAantal
              ? " bij " + S.behaaldAantal + " telling" + (S.behaaldAantal > 1 ? "en" : "")
              : ""),
          eur(S.behaaldTotaal),
        ],
        [
          "Potentiële huurstijging per maand (tellingen net onder de grens)",
          eur(S.potentieelTotaal),
        ],
      ],
      theme: "plain",
      styles: { fontSize: 9.5, textColor: INK, cellPadding: 1.6 },
      columnStyles: {
        0: { cellWidth: 120, textColor: MUT },
        1: { fontStyle: "bold", halign: "right" },
      },
      margin: { left: M, right: M },
    }) + 10;

  const kop = (t: string) => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(...INK);
    doc.text(t, M, y);
    y += 6;
  };
  const stijl = {
    styles: { fontSize: 9, textColor: INK, lineColor: LINE, lineWidth: 0.1, cellPadding: 2 },
    headStyles: { fillColor: SOFT, textColor: INK, fontStyle: "bold" as const },
    alternateRowStyles: { fillColor: ALT },
    margin: { left: M, right: M },
  };

  const segTotaal = S.segLaag.length + S.segMidden.length + S.segHoog.length;
  if (segTotaal) {
    if (y > 250) {
      doc.addPage();
      y = 20;
    }
    kop("Verdeling naar segment");
    y =
      tabel(lib, doc, {
        startY: y,
        head: [["Segment", "Aantal", "Percentage"]],
        body: [
          [
            "Sociale huur (t/m " + S.grensLaag + " punten)",
            String(S.segLaag.length),
            Math.round((S.segLaag.length / segTotaal) * 100) + "%",
          ],
          [
            "Middenhuur (" + (S.grensLaag + 1) + "–" + S.grensMidden + " punten)",
            String(S.segMidden.length),
            Math.round((S.segMidden.length / segTotaal) * 100) + "%",
          ],
          [
            "Vrije sector (vanaf " + (S.grensMidden + 1) + " punten)",
            String(S.segHoog.length),
            Math.round((S.segHoog.length / segTotaal) * 100) + "%",
          ],
        ],
        ...stijl,
        didParseCell: (d) => {
          if (d.section === "body") {
            const kleur =
              d.row.index === 0 ? SEGC.laag : d.row.index === 1 ? SEGC.midden : SEGC.hoog;
            if (d.column.index === 0) d.cell.styles.textColor = kleur;
          }
        },
      }) + 10;
  }

  const labelRijen = S.labelCounts.filter((l) => l.n > 0);
  if (labelRijen.length) {
    if (y > 250) {
      doc.addPage();
      y = 20;
    }
    kop("Verdeling naar energielabel");
    y =
      tabel(lib, doc, {
        startY: y,
        head: [["Label", "Aantal"]],
        body: labelRijen.map((l) => ["Label " + l.label, String(l.n)]),
        ...stijl,
      }) + 10;
  }

  if (S.nabijGrens.length) {
    if (y > 240) {
      doc.addPage();
      y = 20;
    }
    const top = S.nabijGrens
      .slice()
      .sort((a, b) => (b.totaal ?? 0) - (a.totaal ?? 0))
      .slice(0, 5);
    kop("Snelste winst: bijna in de vrije sector");
    y =
      tabel(lib, doc, {
        startY: y,
        head: [["Telling", "Punten", "Nog nodig", "Potentiële winst/mnd"]],
        body: top.map((r) => [
          (r.t.meta && r.t.meta.naam) || weergaveAdres(r.t.meta) || "Naamloze telling",
          String(r.totaal),
          String(r.nodig),
          r.winst != null ? eur(r.winst) : "–",
        ]),
        ...stijl,
      }) + 10;
  }

  if (!klantId && x.isAdmin && S.perCollega.length > 1) {
    if (y > 240) {
      doc.addPage();
      y = 20;
    }
    kop("Werkverdeling per collega");
    y =
      tabel(lib, doc, {
        startY: y,
        head: [["Collega", "Tellingen", "Gem. punten"]],
        body: S.perCollega.map((c) => [
          x.eigenaarNaam(c.ownerId),
          String(c.aantal),
          c.gemPunten != null ? fmt(c.gemPunten, 1) : "–",
        ]),
        ...stijl,
      }) + 10;
  }

  if (y > 265) {
    doc.addPage();
    y = 20;
  }
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(...MUT);
  doc.text(
    doc.splitTextToSize(
      "Cijfers live berekend op basis van de huidige normen (" +
        N.naam +
        "); aan dit overzicht kunnen geen rechten worden ontleend.",
      W - 2 * M,
    ),
    M,
    y,
  );
  voettekst(doc, 1);
  const basis = bestandsBasis(klantId ? klantTxt : "Alle_eigenaren");
  return {
    blob: doc.output("blob"),
    bestandsnaam: "Dashboard_" + basis + "_" + new Date().toISOString().slice(0, 10) + ".pdf",
  };
}
