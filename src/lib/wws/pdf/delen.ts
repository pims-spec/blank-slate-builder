// Bouwstenen van de PDF-rapporten, letterlijk overgezet uit wws-site.html: pdfGaugeCard,
// pdfWozCapNote, pdfTellingBody, pdfCoverPage, pdfBanner, pdfPlattegrondBlok,
// pdfCategorieKaarten, pdfOptiePagina, pdfVerduurzamingPagina, pdfEnergieUitlegPagina,
// pdfMiniGaugeRow en pdfSamenvattingPagina. Zelfde volgorde van tekenen, zelfde teksten.
// Waar de bron de globale normen N gebruikte, komen die hier als parameter binnen.
import type { CellHookData } from "jspdf-autotable";
import type { RouteResultaat } from "../advies";
import { eur, fmt, LABELS, num, overigType, r2, vertrekType } from "../basis";
import { calc, normaliseer } from "../calc";
import type { Normen } from "../normen";
import type { TellingMeta } from "../opslag/types";
import type { Fac, Maat, OverigeRuimte, Vertrek, WwsInput, WwsResultaat } from "../types";
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
  PDF_WARN_BG,
  PDF_WARN_INK,
  facSummary,
  pdfTxt,
  segName,
  tabel,
  wozCapNoteText,
  type Doc,
  type PdfLib,
  type RGB,
} from "./stijl";

type Groep = "vertrekken" | "overig";
type Ruimte = (Vertrek | OverigeRuimte) & { verkoeld?: boolean };
const typeOf = (key: Groep, k: string) => (key === "vertrekken" ? vertrekType(k) : overigType(k));

/** Samenvattingskaart met totaal, segment, huur en de punten-balk — pdfGaugeCard() */
export function pdfGaugeCard(doc: Doc, y: number, R: WwsResultaat, normen: Normen): number {
  const W = PDF_W,
    M = PDF_M,
    PUR = PDF_PUR,
    INK = PDF_INK,
    MUT = PDF_MUT,
    SOFT = PDF_SOFT,
    SEGC = PDF_SEGC;
  const cardH = 30;
  doc.setFillColor(...SOFT);
  doc.roundedRect(M, y, W - 2 * M, cardH, 5, 5, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(...PUR);
  doc.text("TOTAAL", M + 7, y + 8);
  doc.setFontSize(30);
  doc.setTextColor(...INK);
  doc.text(String(R.totaal), M + 7, y + 22);
  const tw = doc.getTextWidth(String(R.totaal));
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(...MUT);
  doc.text("punten", M + 9 + tw, y + 22);
  doc.setFontSize(8);
  doc.text("exact " + fmt(R.exact), M + 7, y + 27);
  const sc = SEGC[R.seg],
    sn = segName(R.seg);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  const pw = doc.getTextWidth(sn) + 10,
    px = M + 68;
  doc.setFillColor(...sc);
  doc.roundedRect(px, y + 7, pw, 7, 3.5, 3.5, "F");
  doc.setTextColor(255);
  doc.text(sn, px + 5, y + 11.9);
  doc.setTextColor(...MUT);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text(
    R.seg === "hoog"
      ? "Huurprijs volgens WWS (vrije sector)"
      : "Maximale kale huur (huurprijstabel 1-1-2026)",
    px,
    y + 20,
  );
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(...INK);
  if (R.maxHuur != null) doc.text(eur(R.maxHuur) + " per maand", px, y + 26);
  if (R.maxHuurOpslag != null) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...MUT);
    doc.text("Met opslag " + R.opslagPct + "%: " + eur(R.maxHuurOpslag), px + 48, y + 26);
  }
  const bx = W - M - 58,
    bw = 50,
    by = y + 13,
    scale = Math.max(250, R.totaal + 20);
  const w1 = (bw * normen.grensLaag) / scale,
    w2 = (bw * (normen.grensMidden - normen.grensLaag)) / scale;
  doc.setFillColor(...SEGC.laag);
  doc.rect(bx, by, w1, 3, "F");
  doc.setFillColor(...SEGC.midden);
  doc.rect(bx + w1, by, w2, 3, "F");
  doc.setFillColor(...SEGC.hoog);
  doc.rect(bx + w1 + w2, by, bw - w1 - w2, 3, "F");
  const mx = bx + bw * Math.min(1, R.totaal / scale);
  doc.setDrawColor(...INK);
  doc.setLineWidth(0.6);
  doc.line(mx, by - 3, mx, by + 6);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.5);
  doc.setTextColor(...MUT);
  doc.text("t/m " + normen.grensLaag, bx + w1 - 0.8, by + 9, { align: "right" });
  doc.text("t/m " + normen.grensMidden, bx + w1 + w2 + 0.8, by + 9);
  const bubTxt = String(R.totaal),
    bubW = doc.getTextWidth(bubTxt) * 0.6 + 8;
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(...PUR);
  doc.setLineWidth(0.3);
  const bubX = Math.min(Math.max(mx - bubW / 2, bx - 2), bx + bw - bubW + 2),
    bubY = by - 11;
  doc.roundedRect(bubX, bubY, bubW, 6.5, 2, 2, "FD");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(...INK);
  doc.text(bubTxt, bubX + bubW / 2, bubY + 4.6, { align: "center" });
  return y + cardH + 8;
}

/** Opvallende melding zodra de WOZ-cap actief is — pdfWozCapNote() */
export function pdfWozCapNote(doc: Doc, y: number, R: WwsResultaat, normen: Normen): number {
  const t = wozCapNoteText(R, normen);
  if (!t) return y;
  const W = PDF_W,
    M = PDF_M;
  const lines: string[] = doc.splitTextToSize(pdfTxt(t), W - 2 * M - 12);
  const h = 6 + lines.length * 4.4;
  if (y + h > 270) {
    doc.addPage();
    y = 20;
  }
  doc.setFillColor(...PDF_WARN_BG);
  doc.roundedRect(M, y, W - 2 * M, h, 4, 4, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(...PDF_WARN_INK);
  let ly = y + 5.5;
  lines.forEach((l) => {
    doc.text(l, M + 6, ly);
    ly += 4.4;
  });
  return y + h + 6;
}

/** De volledige puntentelling: woning, punten per onderdeel, details en huurprijs — pdfTellingBody() */
export function pdfTellingBody(
  lib: PdfLib,
  doc: Doc,
  y: number,
  meta: TellingMeta,
  input: WwsInput,
  normen: Normen,
  opts: { skipGauge?: boolean } = {},
): { y: number; R: WwsResultaat } {
  const W = PDF_W,
    M = PDF_M,
    PUR = PDF_PUR,
    INK = PDF_INK,
    MUT = PDF_MUT,
    SOFT = PDF_SOFT,
    ALT = PDF_ALT,
    LINE = PDF_LINE;
  void W;
  const p = (x: number) => fmt(x);
  const txt = pdfTxt;
  const R = calc(input, normen);
  const byNr = (n: number) => R.rows.filter((r) => r.nr === n).reduce((s, r) => s + r.p, 0);
  // Samenvattingskaart
  if (!opts.skipGauge) y = pdfGaugeCard(doc, y, R, normen);
  const h3 = (t: string) => {
    if (y > 260) {
      doc.addPage();
      y = 20;
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(...PUR);
    doc.text(t.toUpperCase(), M, y);
    y += 4;
  };
  // Woning
  h3("Woning");
  const adres = [
    meta.adres,
    [meta.postcode, meta.huisnummer].filter(Boolean).join(" "),
    meta.plaats,
  ]
    .filter(Boolean)
    .join(", ");
  y =
    tabel(lib, doc, {
      startY: y,
      body: [
        ["Adres", txt(adres || "-")],
        ["Bouwjaar", meta.bouwjaar || "-"],
        ["Type", input.woningtype === "eengezins" ? "Eengezinswoning" : "Meergezinswoning"],
        ["Peildatum", meta.peildatum ? new Date(meta.peildatum).toLocaleDateString("nl-NL") : "-"],
        ["Opgesteld door", meta.opsteller || "-"],
      ],
      theme: "plain",
      styles: { fontSize: 9.5, textColor: INK, cellPadding: 1.4 },
      columnStyles: { 0: { fontStyle: "bold", cellWidth: 40, textColor: MUT } },
      margin: { left: M, right: M },
    }) + 7;
  // Punten per onderdeel (compact overzicht)
  const onderdelen: [string, string, number][] = [
    ["Woning", "energieprestatie en WOZ-waarde", byNr(4) + byNr(11)],
    [
      "Binnenruimtes",
      "ruimten, verwarming, keuken en sanitair",
      byNr(1) + byNr(2) + byNr(3) + byNr(5) + byNr(6) + byNr(9),
    ],
    ["Buitenruimtes", "buitenruimten en parkeren", byNr(8) + byNr(10)],
    [
      "Bijzonderheden",
      "handicap, bijzondere voorzieningen, monument",
      byNr(7) + byNr(12) + byNr(13),
    ],
  ];
  h3("Punten per onderdeel");
  y =
    tabel(lib, doc, {
      startY: y,
      head: [["Onderdeel", "Omvat", "Punten"]],
      body: onderdelen.map((o) => [o[0], o[1], p(o[2])]),
      foot: [["Totaal (afgerond)", "Exact " + fmt(R.exact), String(R.totaal)]],
      showFoot: "lastPage",
      styles: { fontSize: 9, textColor: INK, lineColor: LINE, lineWidth: 0.1, cellPadding: 2.2 },
      headStyles: { fillColor: PUR, textColor: 255, fontStyle: "bold" },
      footStyles: { fillColor: SOFT, textColor: PUR, fontStyle: "bold" },
      alternateRowStyles: { fillColor: ALT },
      columnStyles: {
        0: { fontStyle: "bold", cellWidth: 38 },
        1: { textColor: MUT },
        2: { halign: "right", cellWidth: 22, fontStyle: "bold" },
      },
      margin: { top: 18, left: M, right: M, bottom: 22 },
    }) + 8;
  // Details per onderdeel, indeling zoals de Huurprijscheck: categorie › ruimte › voorzieningen
  h3("Details van de puntentelling");
  type RijType = "sub" | "item" | "voorz" | "tot";
  type DetailRij = [string, string, string, RijType?];
  const detailTabel = (
    titel: string,
    metM2: boolean,
    rijen: DetailRij[],
    totaalLabel: string,
    totaal: number,
  ) => {
    const body: string[][] = [],
      types: RijType[] = [];
    rijen.forEach((r) => {
      body.push(metM2 ? [r[0], r[1] || "", r[2] || ""] : [r[0], r[2] || ""]);
      types.push(r[3] || "item");
    });
    body.push(metM2 ? [totaalLabel, "", p(totaal)] : [totaalLabel, p(totaal)]);
    types.push("tot");
    if (y > 248) {
      doc.addPage();
      y = 20;
    }
    y =
      tabel(lib, doc, {
        startY: y,
        head: [metM2 ? [titel, "m2", "Punten"] : [titel, "Punten"]],
        body,
        styles: {
          fontSize: 9,
          textColor: INK,
          lineColor: LINE,
          lineWidth: 0.1,
          cellPadding: { top: 2, bottom: 2, left: 3, right: 3 },
        },
        headStyles: { fillColor: PUR, textColor: 255, fontStyle: "bold" },
        columnStyles: metM2
          ? { 1: { cellWidth: 22, halign: "right" }, 2: { cellWidth: 22, halign: "right" } }
          : { 1: { cellWidth: 22, halign: "right" } },
        margin: { top: 18, left: M, right: M, bottom: 22 },
        didParseCell: (d: CellHookData) => {
          if (d.section !== "body") return;
          const t = types[d.row.index];
          if (t === "sub") {
            d.cell.styles.fillColor = SOFT;
            d.cell.styles.fontStyle = "bold";
          }
          if (t === "item") {
            d.cell.styles.fillColor = [255, 255, 255];
            if (d.column.index === 0)
              d.cell.styles.cellPadding = { top: 1.8, bottom: 1.8, left: 8, right: 3 };
            d.cell.styles.textColor = [40, 40, 60];
          }
          if (t === "voorz") {
            d.cell.styles.fillColor = [255, 255, 255];
            d.cell.styles.fontSize = 8;
            d.cell.styles.textColor = MUT;
            if (d.column.index === 0)
              d.cell.styles.cellPadding = { top: 1.2, bottom: 1.2, left: 13, right: 3 };
            else d.cell.styles.cellPadding = { top: 1.2, bottom: 1.2, left: 3, right: 3 };
          }
          if (t === "tot") {
            d.cell.styles.fillColor = SOFT;
            d.cell.styles.textColor = PUR;
            d.cell.styles.fontStyle = "bold";
          }
        },
      }) + 6;
  };
  const m2s = (x: unknown) => (num(x) ? fmt(r2(num(x))) : "");
  const rn = (key: Groep, r: Ruimte) => {
    const l = typeOf(key, r.type).l;
    return txt(l + (r.naam && r.naam.toLowerCase() !== l.toLowerCase() ? " (" + r.naam + ")" : ""));
  };
  const mt = (r: Ruimte) =>
    ((r.maten || []) as Maat[])
      .filter((m) => num(m.l) !== 0 && num(m.b) !== 0)
      .map((m, k) => {
        const neg = num(m.l) * num(m.b) < 0;
        return (
          (k ? (neg ? " - " : " + ") : neg ? "-" : "") +
          fmt(Math.abs(num(m.l))) +
          " x " +
          fmt(Math.abs(num(m.b)))
        );
      })
      .join("");
  // Woning
  const e4 = R.rows.find((r) => r.nr === 4)!,
    w11 = R.rows.find((r) => r.nr === 11)!;
  detailTabel(
    "Woning",
    false,
    [
      ["Energieprestatie", "", p(e4.p), "sub"],
      [txt(e4.t), "", "", "item"],
      ["WOZ-waarde", "", p(w11.p), "sub"],
      [txt(w11.t), "", "", "item"],
    ],
    "Totaal Woning",
    byNr(4) + byNr(11),
  );
  y = pdfWozCapNote(doc, y, R, normen);
  // Binnenruimtes
  const bin: DetailRij[] = [];
  bin.push(["Vertrekken", String(R.oppV), p(byNr(1)), "sub"]);
  input.vertrekken.forEach((r) => {
    const m = mt(r);
    bin.push([rn("vertrekken", r) + (m ? "  (" + m + ")" : ""), m2s(r.m2), "", "item"]);
  });
  const ovT = input.overig.filter((r) => !typeOf("overig", r.type).verkeer);
  bin.push(["Overige ruimten", String(R.oppO), p(byNr(2)), "sub"]);
  ovT.forEach((r) => {
    const m = mt(r);
    bin.push([
      rn("overig", r) +
        (m ? "  (" + m + ")" : "") +
        (num(r.m2) > 0 && num(r.m2) < normen.minOverig ? ", kleiner dan 2 m2" : ""),
      m2s(r.m2),
      "",
      "item",
    ]);
  });
  const vk = input.overig.filter((r) => typeOf("overig", r.type).verkeer);
  if (vk.length) {
    bin.push(["Verkeersruimten (geen oppervlaktepunten)", "", "", "sub"]);
    vk.forEach((r) => bin.push([rn("overig", r), m2s(r.m2), "", "item"]));
  }
  bin.push(["Verwarming en verkoeling", "", p(byNr(3)), "sub"]);
  input.vertrekken
    .filter((r) => r.verwarmd)
    .forEach((r) => {
      const n = typeOf("vertrekken", r.type).verwVertrekken || 1;
      bin.push([
        rn("vertrekken", r) +
          ": verwarmd" +
          (n > 1 ? " (incl. open keuken)" : "") +
          (r.verkoeld ? " en verkoeld" : ""),
        "",
        p(n * normen.verwVertrek),
        "item",
      ]);
    });
  const ovw = input.overig.filter((r) => r.verwarmd);
  ovw.forEach((r, k) =>
    bin.push([
      rn("overig", r) + ": verwarmd" + (k >= normen.verwOverigMax ? " (boven maximum)" : ""),
      "",
      k < normen.verwOverigMax ? p(normen.verwOverig) : "0",
      "item",
    ]),
  );
  const kl = input.vertrekken.filter((r) => r.verwarmd && r.verkoeld);
  kl.forEach((r, k) =>
    bin.push([
      "Verkoeling " +
        rn("vertrekken", r).toLowerCase() +
        (k >= normen.verkoelMax ? " (boven maximum)" : ""),
      "",
      k < normen.verkoelMax ? p(normen.verkoelVertrek) : "0",
      "item",
    ]),
  );
  bin.push(["Keuken", "", p(byNr(5)), "sub"]);
  input.vertrekken
    .filter((r) => r.fac && r.fac.kind === "keuken")
    .forEach((r) => {
      const f = r.fac as Extract<Fac, { kind: "keuken" }>;
      const k = f.keuken;
      const kb =
        k.lengte === ">=2" ? normen.keukenLang : k.lengte === "1-2" ? normen.keukenKort : 0;
      bin.push([
        rn("vertrekken", r) +
          ": aanrecht " +
          { "<1": "korter dan 1 m", "1-2": "1 tot 2 m", ">=2": "langer dan 2 m" }[k.lengte],
        "",
        p(kb),
        "item",
      ]);
      let som = 0;
      (normen.voorzKeuken || []).forEach((it) => {
        const c = num((k.voorz as Record<string, unknown>)[it.k]);
        if (c) {
          som += c * it.p;
          bin.push([it.l + (c > 1 ? " (x" + c + ")" : ""), "", p(c * it.p), "voorz"]);
        }
      });
      if (kb && som > kb)
        bin.push([
          "Extra voorzieningen afgetopt op " + p(kb) + " punten",
          "",
          "-" + p(som - kb),
          "voorz",
        ]);
    });
  bin.push(["Sanitair", "", p(byNr(6)), "sub"]);
  const NS = normen.san;
  (["vertrekken", "overig"] as const).forEach((key) =>
    (input[key] as Ruimte[]).forEach((r) => {
      const f = r.fac;
      if (!f || f.kind === "keuken") return;
      let pts = 0,
        dbR = 0;
      if (f.kind === "badkamer") {
        const b = f.san;
        dbR = num(b.douche) * NS.douche + num(b.bad) * NS.bad + num(b.badDouche) * NS.badDouche;
        pts =
          num(b.toiletStaand) * NS.toiletStaandBad +
          num(b.toiletHang) * NS.toiletHangBad +
          num(b.wastafel) * NS.wastafelBad +
          num(b.meerpers) * NS.meerpersBad +
          dbR;
      }
      if (f.kind === "slaap_san") {
        const b = f.san;
        pts =
          Math.min(1, num(b.wastafel)) * NS.wastafelElders +
          Math.min(1, num(b.meerpers)) * NS.meerpersElders +
          num(b.douche) * NS.douche +
          num(b.bad) * NS.bad +
          num(b.badDouche) * NS.badDouche;
      }
      if (f.kind === "toilet") {
        pts =
          (f.toilet.toilet === "staand"
            ? NS.toiletStaandApart
            : f.toilet.toilet === "hangend"
              ? NS.toiletHangApart
              : 0) + (f.toilet.fontein ? NS.wastafelElders : 0);
      }
      if (f.kind === "was") {
        pts = f.was.wastafel ? NS.wastafelElders : 0;
      }
      bin.push([
        rn(key, r) + ": " + txt(facSummary(f.kind, f).replace(/^[A-Za-z]+: /, "")),
        "",
        p(pts),
        "item",
      ]);
      // Extra sanitaire voorzieningen gelden per bad-/doucheruimte en worden per ruimte afgetopt
      // op de punten van de douche/het bad in diezelfde ruimte (beleidsboek 2.6.2)
      if (f.kind === "badkamer" && f.san.eisenOk) {
        let exR = 0;
        (normen.voorzSan || []).forEach((it) => {
          let c = num((f.san.voorz as Record<string, unknown>)[it.k]);
          if (it.k === "kastruimte") c = Math.min(c, 1);
          if (!c) return;
          exR += c * it.p;
          bin.push([it.l + (c > 1 ? " (x" + c + ")" : ""), "", p(c * it.p), "voorz"]);
        });
        if (exR > dbR)
          bin.push([
            "Extra voorzieningen in deze ruimte afgetopt op " + p(dbR) + " punten",
            "",
            "-" + p(exR - dbR),
            "voorz",
          ]);
      }
    }),
  );
  if (byNr(9)) {
    const g = R.rows.find((r) => r.nr === 9)!;
    bin.push(["Gemeenschappelijke ruimten", "", p(byNr(9)), "sub"]);
    bin.push([txt(g.t), "", "", "item"]);
  }
  detailTabel("Binnenruimtes", true, bin, "Totaal Binnenruimtes", onderdelen[1]![2]);
  // Buitenruimtes
  const b8 = R.rows.find((r) => r.nr === 8)!,
    b10 = R.rows.find((r) => r.nr === 10)!;
  const bu: DetailRij[] = [
    ["Buitenruimten", "", p(b8.p), "sub"],
    [txt(b8.t), "", "", "item"],
  ];
  if (b10.p)
    bu.push(
      ["Gemeenschappelijke parkeerruimten", "", p(b10.p), "sub"],
      [txt(b10.t), "", "", "item"],
    );
  detailTabel("Buitenruimtes", false, bu, "Totaal Buitenruimtes", onderdelen[2]![2]);
  // Bijzonderheden
  const bz: DetailRij[] = [];
  R.rows
    .filter((r) => [7, 12, 13].includes(r.nr) && r.p !== 0)
    .forEach((r) =>
      bz.push([txt(r.naam) + (r.t && r.t !== "geen" ? ": " + txt(r.t) : ""), "", p(r.p), "item"]),
    );
  if (bz.length)
    detailTabel("Bijzonderheden", false, bz, "Totaal Bijzonderheden", onderdelen[3]![2]);
  // Huurprijs
  if (R.maxHuur != null) {
    const maxHuur = R.maxHuur;
    const hr: string[][] = [
      [R.seg === "hoog" ? "Huurprijs volgens WWS" : "Maximale kale huurprijs", eur(maxHuur)],
    ];
    R.opslagen.forEach((o) =>
      hr.push([o[1] + "% " + o[0].toLowerCase(), eur(r2((maxHuur * o[1]) / 100))]),
    );
    if (R.maxHuurOpslag != null) hr.push(["Inclusief opslagen", eur(R.maxHuurOpslag)]);
    h3("Huurprijs");
    y =
      tabel(lib, doc, {
        startY: y,
        body: hr,
        styles: { fontSize: 9, textColor: INK, lineColor: LINE, lineWidth: 0.1, cellPadding: 2.2 },
        alternateRowStyles: { fillColor: ALT },
        columnStyles: { 1: { halign: "right", cellWidth: 40 } },
        margin: { top: 18, left: M, right: M, bottom: 22 },
        didParseCell: (d: CellHookData) => {
          if (d.row.index === hr.length - 1 && hr.length > 1) d.cell.styles.fontStyle = "bold";
        },
      }) + 7;
  }
  return { y, R };
}

/** Voorpagina met de grote GoHome-wordmark en het adres — pdfCoverPage() */
export function pdfCoverPage(doc: Doc, meta: TellingMeta, titel?: string) {
  const W = PDF_W,
    H = 297,
    INK = PDF_INK,
    SOFT = PDF_SOFT,
    LINE = PDF_LINE;
  const COVER_PUR: RGB = [127, 125, 255];
  const CX = 78;
  doc.setFillColor(...SOFT);
  doc.rect(0, 0, W, H, "F");
  doc.setFillColor(...COVER_PUR);
  doc.lines(
    [
      [66.4, 52.9],
      [0, 193.6],
      [-66.4, 50.5],
    ],
    0,
    0,
    [1, 1],
    "F",
    true,
  );
  doc.setFont("helvetica", "bold");
  doc.setFontSize(108);
  doc.setTextColor(...INK);
  doc.text("GoHome", 26, 129);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(14);
  doc.setTextColor(...INK);
  doc.text(
    doc.splitTextToSize(titel || "Rapportage puntentelling & verbeteradvies", W - CX - 16),
    CX,
    178,
  );
  const mHn = /^(\d+)\s*[-\s]?\s*(.*)$/.exec(String(meta.huisnummer || "").trim());
  const rows = [
    ["Straat", meta.adres || "-"],
    ["Huisnummer", mHn ? mHn[1]! : meta.huisnummer || "-"],
    ["Toevoeging", mHn ? mHn[2]! : ""],
    ["Plaats", meta.plaats || "-"],
    ["Postcode", meta.postcode || "-"],
  ].filter((r) => r[0] !== "Toevoeging" || r[1]);
  let y = 209;
  rows.forEach((r) => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9.5);
    doc.setTextColor(...INK);
    doc.text(pdfTxt(r[0]), CX, y);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...INK);
    doc.text(pdfTxt(String(r[1])), 110, y);
    doc.setDrawColor(...LINE);
    doc.setLineWidth(0.2);
    doc.line(CX, y + 2.5, W - 10, y + 2.5);
    y += 8;
  });
}

/** Kopbalk met badge, titel, ondertitel en datum — pdfBanner(); geeft de y onder de kop */
export function pdfBanner(
  doc: Doc,
  badge: string,
  titel: string,
  sub?: string,
  dateText?: string,
): number {
  const W = PDF_W,
    M = PDF_M,
    MUT = PDF_MUT,
    SOFT = PDF_SOFT,
    INK = PDF_INK;
  const BANDPUR: RGB = [127, 125, 255];
  doc.setFillColor(...SOFT);
  doc.rect(0, 0, W, 22, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(...BANDPUR);
  doc.text(pdfTxt(badge), M, 14);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(...BANDPUR);
  doc.text("GoHome", W - 8, 14, { align: "right" });
  // Titel: laat op 22pt passen; anders stapsgewijs kleiner, en anders twee regels
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...INK);
  const titelTxt = pdfTxt(titel),
    maxW = W - 2 * M;
  let fs = 22;
  doc.setFontSize(fs);
  while (fs > 14 && doc.getTextWidth(titelTxt) > maxW) {
    fs -= 1;
    doc.setFontSize(fs);
  }
  let titelLines: string[] = [titelTxt];
  if (doc.getTextWidth(titelTxt) > maxW)
    titelLines = (doc.splitTextToSize(titelTxt, maxW) as string[]).slice(0, 2);
  let ty = 38;
  if (titelLines.length > 1) {
    doc.text(titelLines[0]!, M, 32);
    doc.text(titelLines[1]!, M, 32 + fs * 0.42);
    ty = 32 + fs * 0.42 + 7;
  } else {
    doc.text(titelLines[0]!, M, ty);
    ty += 7;
  }
  let y = ty;
  if (sub) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    doc.setTextColor(...MUT);
    doc.text(pdfTxt(sub), M, y);
    y += 5.5;
  }
  if (dateText) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...MUT);
    doc.text(pdfTxt(dateText), M, y);
    y += 5;
  }
  return Math.max(y + 2, 48);
}

/**
 * Plattegrond-afbeelding (JPEG data-URL) — pdfPlattegrondBlok(). In de bron uit
 * input.plattegrondImg; hier meegegeven, want plattegronden komen pas in fase 4c (Storage).
 */
export function pdfPlattegrondBlok(doc: Doc, y: number, img?: string | null, maxH = 85): number {
  if (!img) return y;
  const W = PDF_W,
    M = PDF_M,
    PUR = PDF_PUR,
    MUT = PDF_MUT;
  try {
    const props = doc.getImageProperties(img);
    const maxW = W - 2 * M;
    let w = maxW,
      h = (w * props.height) / props.width;
    if (h > maxH) {
      h = maxH;
      w = (h * props.width) / props.height;
    }
    if (y + h + 10 > 270) {
      doc.addPage();
      y = 20;
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(...PUR);
    doc.text("PLATTEGROND", M, y);
    y += 5.5;
    const x = M + (maxW - w) / 2;
    doc.addImage(img, "JPEG", x, y, w, h);
    return y + h + 8;
  } catch {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(...MUT);
    doc.text("De plattegrond kon niet worden weergegeven.", M, y);
    return y + 6;
  }
}

export const CATEGORIE_VAN_KEY: Record<string, string> = {
  label: "Energielabel",
  indexKlasse: "Energielabel",
  verwVertrek: "Verwarming en verkoeling",
  verwOverig: "Verwarming en verkoeling",
  koeling: "Verwarming en verkoeling",
  aanrecht: "Keuken",
  keukenExtra: "Keuken",
  bad: "Sanitair",
  toiletHang: "Sanitair",
  toilet: "Sanitair",
  wastafel: "Sanitair",
  sanExtra: "Sanitair",
  balkon: "Buitenruimte",
  aanbel: "Overig",
  laadpaal: "Overig",
};

/** Een route zoals de PDF hem tekent (berekenRoute(), of de selectie uit het adviesdialoog) */
export type PdfRoute = Pick<
  RouteResultaat,
  "start" | "eind" | "stappen" | "doel" | "gehaald" | "kosten"
> &
  Partial<Pick<RouteResultaat, "vanLabel" | "vanOmschrijving" | "origSoort">> & {
    input?: WwsInput;
  };

/** Kaarten met de maatregelen per onderdeel — pdfCategorieKaarten() */
export function pdfCategorieKaarten(doc: Doc, y: number, route: PdfRoute): number {
  const W = PDF_W,
    M = PDF_M,
    PUR = PDF_PUR,
    INK = PDF_INK,
    MUT = PDF_MUT,
    SOFT = PDF_SOFT;
  interface Cat {
    naam: string;
    g: number;
    bullets: string[];
    energie: {
      van: string | undefined;
      vanIsLabel: boolean;
      naar: string | undefined;
      bron: string | undefined;
      kostenMin: number;
      kostenMax: number;
      besparingMin: number;
      besparingMax: number;
    } | null;
  }
  const cats: Cat[] = [];
  route.stappen.forEach((g) => {
    const naam = CATEGORIE_VAN_KEY[g.key] || "Overig";
    let c = cats.find((x) => x.naam === naam);
    if (!c) {
      c = { naam, g: 0, bullets: [], energie: null };
      cats.push(c);
    }
    c.g += g.g;
    if (g.key === "label") {
      const isLabel = route.origSoort === "label" || route.origSoort === "labelOud";
      c.energie = {
        van: isLabel ? route.vanLabel : route.vanOmschrijving,
        vanIsLabel: isLabel,
        naar: g.naarLabel,
        bron: g.bron,
        kostenMin: g.kostenMin,
        kostenMax: g.kostenMax,
        besparingMin: g.besparingMin,
        besparingMax: g.besparingMax,
      };
      (g.omschrijving && g.omschrijving.length ? g.omschrijving : [g.o]).forEach((d) =>
        c.bullets.push(d),
      );
    } else {
      (g.delen && g.delen.length ? g.delen : [g.o]).forEach((d) =>
        c.bullets.push(d.replace(/ \(keuken\)$/, "")),
      );
    }
  });
  if (!cats.length) {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(9.5);
    doc.setTextColor(...MUT);
    doc.text("Geen maatregelen nodig voor deze optie.", M, y);
    return y + 8;
  }
  const splits = (l: string): string[] => doc.splitTextToSize(l, W - 2 * M - 14);
  cats.forEach((c) => {
    const bodyLines = c.bullets.map((b) => "-  " + pdfTxt(b));
    const extra: string[] = [];
    if (c.energie) {
      extra.push(
        c.energie.vanIsLabel
          ? "Van label " + c.energie.van + " naar " + (c.energie.naar || "?")
          : "Van " + c.energie.van + " naar nieuw energielabel " + (c.energie.naar || "?"),
      );
      if (c.energie.bron === "advies") {
        extra.push(
          "Kosten: " +
            eur(c.energie.kostenMin) +
            (c.energie.kostenMax > c.energie.kostenMin ? " – " + eur(c.energie.kostenMax) : ""),
        );
        if (c.energie.besparingMin || c.energie.besparingMax)
          extra.push(
            "Besparing: " +
              eur(c.energie.besparingMin) +
              (c.energie.besparingMax > c.energie.besparingMin
                ? " – " + eur(c.energie.besparingMax)
                : "") +
              " per jaar",
          );
      }
    }
    const extraWrapped = extra.flatMap((l) => splits(pdfTxt(l)));
    const bodyWrapped = bodyLines.flatMap((l) => splits(l));
    const cardH = 16 + extraWrapped.length * 4.6 + bodyWrapped.length * 4.6;
    if (y + cardH > 268) {
      doc.addPage();
      y = 20;
    }
    doc.setFillColor(...SOFT);
    doc.roundedRect(M, y, W - 2 * M, cardH, 4, 4, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(...INK);
    doc.text(c.naam, M + 6, y + 9);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(...PUR);
    doc.text((c.g >= 0 ? "+" : "") + fmt(c.g) + " punten", W - M - 6, y + 9, { align: "right" });
    let yy2 = y + 15;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(...INK);
    extraWrapped.forEach((l) => {
      doc.text(l, M + 6, yy2);
      yy2 += 4.6;
    });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...MUT);
    bodyWrapped.forEach((l) => {
      doc.text(l, M + 6, yy2);
      yy2 += 4.6;
    });
    y += cardH + 6;
  });
  return y;
}

/** Een adviesoptie op een nieuwe pagina, eventueel met de volledige telling — pdfOptiePagina() */
export function pdfOptiePagina(
  lib: PdfLib,
  doc: Doc,
  normen: Normen,
  idx: number,
  titel: string,
  sub: string,
  route: PdfRoute,
  badge?: string,
  meta?: TellingMeta,
): { y: number; R: WwsResultaat | null } {
  const W = PDF_W,
    M = PDF_M,
    PUR = PDF_PUR,
    INK = PDF_INK,
    SOFT = PDF_SOFT;
  doc.addPage();
  let y = pdfBanner(doc, badge || "Advies, optie " + idx, titel, sub);
  y = pdfGaugeCard(doc, y, route.eind, normen);
  doc.setFillColor(...SOFT);
  doc.roundedRect(M, y, W - 2 * M, 22, 5, 5, "F");
  const kc = [
    ["NU", String(route.start.totaal)],
    ["DOEL", String(route.doel)],
    ["MET DEZE OPTIE", String(route.eind.totaal)],
    ["KOSTEN (INDICATIE)", eur(route.kosten)],
  ] as const;
  kc.forEach((k, n) => {
    const x = M + 7 + n * 44.5;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(...PUR);
    doc.text(k[0], x, y + 8);
    doc.setFontSize(n === 3 ? 12 : 17);
    doc.setTextColor(...INK);
    doc.text(k[1], x, y + 17);
  });
  y += 29;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  doc.setTextColor(...INK);
  const okVrij = route.eind.totaal >= normen.grensMidden + 1;
  doc.text(
    doc.splitTextToSize(
      route.gehaald
        ? "Met deze optie komt de woning op " +
            route.eind.totaal +
            " punten" +
            (okVrij ? " en valt hij in de vrije sector." : ".")
        : "Met de beschikbare maatregelen komt de woning maximaal op " +
            route.eind.totaal +
            " punten; het doel van " +
            route.doel +
            " punten wordt niet gehaald.",
      W - 2 * M,
    ),
    M,
    y,
  );
  y += 10;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...PUR);
  doc.text("MAATREGELEN PER ONDERDEEL", M, y);
  y += 6.5;
  y = pdfCategorieKaarten(doc, y, route);
  let R: WwsResultaat | null = null;
  if (meta && route.input) {
    if (y > 258) {
      doc.addPage();
      y = 20;
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(...PUR);
    doc.text("VOLLEDIGE PUNTENTELLING MET DEZE OPTIE", M, y);
    y += 5.5;
    const body = pdfTellingBody(lib, doc, y, meta, route.input, normen, { skipGauge: true });
    y = body.y;
    R = body.R;
  }
  return { y, R };
}

/** Losse velden van een geüpload verduurzamingsadvies; bewust ruim gelezen (oude tellingen) */
type Los = Record<string, unknown>;
const los = (x: unknown): Los => (x && typeof x === "object" ? (x as Los) : {});

/** Verduurzamingsopties uit een geüpload advies — pdfVerduurzamingPagina() */
export function pdfVerduurzamingPagina(lib: PdfLib, doc: Doc, EA: unknown) {
  if (!EA) return;
  const W = PDF_W,
    M = PDF_M,
    PUR = PDF_PUR,
    INK = PDF_INK,
    MUT = PDF_MUT,
    SOFT = PDF_SOFT;
  doc.addPage();
  let y = pdfBanner(
    doc,
    "WWS-rapport",
    "Verduurzamingsopties",
    "Op basis van het geüploade verduurzamings- of energieadvies",
  );
  const ea = los(EA);
  const H = ea["huidig"] ? los(ea["huidig"]) : null;
  if (H) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(...PUR);
    doc.text("HUIDIGE ENERGIESTATUS", M, y);
    y += 4;
    const rows: string[][] = [];
    if (H["label"]) rows.push(["Energielabel", H["label"] as string]);
    if (H["woningtype"]) rows.push(["Woningtype", pdfTxt(H["woningtype"])]);
    if (H["bouwjaar"]) rows.push(["Bouwjaar", pdfTxt(String(H["bouwjaar"]))]);
    if (H["oppervlakte_m2"])
      rows.push(["Oppervlakte", pdfTxt(fmt(H["oppervlakte_m2"] as number) + " m²")]);
    const inst = los(H["installaties"]);
    [
      ["verwarming", "Verwarming"],
      ["warmwater", "Warm water"],
      ["pv", "Zonnepanelen"],
      ["ventilatie", "Ventilatie"],
      ["koeling", "Koeling"],
    ].forEach(function (p) {
      if (inst[p[0]!]) rows.push([p[1]!, pdfTxt(inst[p[0]!])]);
    });
    const iso = los(H["isolatie"]);
    if (iso["muur"]) rows.push(["Isolatie muur", pdfTxt(iso["muur"])]);
    if (iso["glas"]) rows.push(["Isolatie glas", pdfTxt(iso["glas"])]);
    if (rows.length) {
      y =
        tabel(lib, doc, {
          startY: y,
          body: rows,
          theme: "plain",
          styles: { fontSize: 9.5, textColor: INK, cellPadding: 1.4 },
          columnStyles: { 0: { fontStyle: "bold", cellWidth: 45, textColor: MUT } },
          margin: { left: M, right: M },
        }) + 7;
    }
  }
  const mr = (Array.isArray(ea["maatregelen"]) ? ea["maatregelen"] : []) as Los[];
  if (mr.length) {
    if (y > 250) {
      doc.addPage();
      y = 20;
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(...PUR);
    doc.text("AANBEVOLEN MAATREGELEN", M, y);
    y += 4;
    const splits = (l: string): string[] => doc.splitTextToSize(l, W - 2 * M - 14);
    mr.forEach((m, i) => {
      const om = (Array.isArray(m["omschrijving"]) ? m["omschrijving"] : []) as unknown[];
      const bodyLines = om.map((d) => "-  " + pdfTxt(d));
      const wrapped = bodyLines.flatMap((l) => splits(l));
      // de bron rekent hier met de ruwe waarden (eur() van een getal)
      const kMin = m["kostenMin"] as number,
        kMax = m["kostenMax"] as number,
        bMin = m["besparingMin"] as number,
        bMax = m["besparingMax"] as number;
      const kostTxt = "Kosten: " + eur(kMin) + (kMax > kMin ? " – " + eur(kMax) : "");
      const bespTxt =
        bMin || bMax
          ? "Besparing: " + eur(bMin) + (bMax > bMin ? " – " + eur(bMax) : "") + " per jaar"
          : "";
      const extraLines = [kostTxt].concat(bespTxt ? [bespTxt] : []).flatMap((l) => splits(l));
      const cardH = 16 + extraLines.length * 4.6 + wrapped.length * 4.6;
      if (y + cardH > 268) {
        doc.addPage();
        y = 20;
      }
      doc.setFillColor(...SOFT);
      doc.roundedRect(M, y, W - 2 * M, cardH, 4, 4, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10.5);
      doc.setTextColor(...INK);
      doc.text(
        "Maatregel " + (i + 1) + ": van " + m["vanLabel"] + " naar " + m["naarLabel"],
        M + 6,
        y + 9,
      );
      let yy = y + 15;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(...MUT);
      wrapped.forEach((l) => {
        doc.text(l, M + 6, yy);
        yy += 4.6;
      });
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(...PUR);
      extraLines.forEach((l) => {
        doc.text(l, M + 6, yy);
        yy += 4.6;
      });
      y += cardH + 6;
    });
  }
  return y;
}

function hsl2rgb(h: number, s: number, l: number): RGB {
  s /= 100;
  l /= 100;
  const c = (1 - Math.abs(2 * l - 1)) * s,
    x = c * (1 - Math.abs(((h / 60) % 2) - 1)),
    m = l - c / 2;
  let r = 0,
    g = 0,
    b = 0;
  if (h < 60) {
    r = c;
    g = x;
    b = 0;
  } else if (h < 120) {
    r = x;
    g = c;
    b = 0;
  } else if (h < 180) {
    r = 0;
    g = c;
    b = x;
  } else if (h < 240) {
    r = 0;
    g = x;
    b = c;
  } else if (h < 300) {
    r = c;
    g = 0;
    b = x;
  } else {
    r = x;
    g = 0;
    b = c;
  }
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}
const pdfLabelKleur = (i: number, n: number) =>
  hsl2rgb(120 - (120 * i) / Math.max(1, n - 1), 68, 43);
function pdfLabelChevron(
  doc: Doc,
  x: number,
  y: number,
  w: number,
  h: number,
  label: string,
  color: RGB,
) {
  doc.setFillColor(...color);
  doc.lines(
    [
      [w - h * 0.45, 0],
      [h * 0.45, h / 2],
      [-h * 0.45, h / 2],
      [-(w - h * 0.45), 0],
    ],
    x,
    y,
    [1, 1],
    "F",
    true,
  );
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(255, 255, 255);
  doc.text(label, x + 3.5, y + h / 2 + 1.1);
}
function pdfKaartHeader(doc: Doc, M: number, y: number, titel: string, sub?: string): number {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.setTextColor(...PDF_INK);
  doc.text(titel, M, y);
  y += 7;
  if (sub) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    doc.setTextColor(...PDF_MUT);
    doc.text(sub, M, y);
    y += 8;
  }
  return y;
}

/** Uitleg over energielabel en WOZ-waarde — pdfEnergieUitlegPagina() */
export function pdfEnergieUitlegPagina(doc: Doc, normen: Normen): number {
  const W = PDF_W,
    M = PDF_M,
    INK = PDF_INK;
  const CARDBORDER: RGB = [214, 211, 255];
  doc.addPage();
  let y = pdfBanner(
    doc,
    "WWS-rapport",
    "Energielabel en WOZ-waarde",
    "Algemene uitleg over deze twee onderdelen van de puntentelling",
  );
  // Kaart: punten per energielabel, met gekleurde labelvlaggen
  y = pdfKaartHeader(
    doc,
    M,
    y,
    "Energielabel",
    "Hieronder is een overzicht van de punten per energielabel.",
  );
  const cardW = W - 2 * M,
    padX = 7,
    rowH = 8.4,
    chevW = 26,
    chevH = 5.6,
    col1 = M + 66,
    col2 = M + 128;
  const nRows = LABELS.length + 1;
  const cardH = 12 + nRows * rowH;
  if (y + cardH > 270) {
    doc.addPage();
    y = 20;
  }
  doc.setDrawColor(...CARDBORDER);
  doc.setLineWidth(0.4);
  doc.roundedRect(M, y, cardW, cardH, 4, 4, "S");
  let ty = y + 11;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.5);
  doc.setTextColor(...INK);
  doc.text("Label", M + padX, ty);
  doc.text("Eengezinswoning", col1, ty);
  doc.text("Meergezinswoning", col2, ty);
  ty += 7;
  LABELS.forEach((l, i) => {
    pdfLabelChevron(
      doc,
      M + padX,
      ty - chevH + 1.5,
      chevW,
      chevH,
      l,
      pdfLabelKleur(i, LABELS.length),
    );
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    doc.setTextColor(...INK);
    const e = normen.energie[l]!;
    doc.text(fmt(e[0]), col1, ty);
    doc.text(fmt(e[1]), col2, ty);
    doc.setDrawColor(...CARDBORDER);
    doc.setLineDashPattern([0.6, 0.9], 0);
    doc.setLineWidth(0.25);
    doc.line(M + padX, ty + 2.6, M + cardW - padX, ty + 2.6);
    doc.setLineDashPattern([], 0);
    ty += rowH;
  });
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.5);
  doc.setTextColor(...INK);
  doc.text("EPV", M + padX, ty);
  doc.setFont("helvetica", "normal");
  doc.text(fmt(normen.epv[0]), col1, ty);
  doc.text(fmt(normen.epv[1]), col2, ty);
  y += cardH + 12;

  // Kaart: WOZ-waarde, in twee delen plus de cap
  const wj = Object.keys(normen.woz).sort().reverse()[0]!;
  const kg = normen.woz[wj]!;
  const labelW = 30;
  const breedte = cardW - 2 * padX - labelW;
  const deel1: string[] = doc.splitTextToSize(
    pdfTxt("Voor elke " + eur(kg[0]) + " van de laatstelijk vastgestelde WOZ-waarde: 1 punt"),
    breedte,
  );
  const deel2: string[] = doc.splitTextToSize(
    pdfTxt(
      "Voor elke " +
        eur(kg[1]) +
        " van de WOZ-waarde per m² van vertrekken + overige ruimten van de woning: 1 punt",
    ),
    breedte,
  );
  const capTxt: string[] = doc.splitTextToSize(
    pdfTxt(
      normen.wozCapPct +
        "% WOZ-cap is alleen van kracht wanneer de woning zich niet in de vrije sector bevindt. De WOZ-cap houdt in dat de WOZ-waarde niet meer dan " +
        normen.wozCapPct +
        "% van het totaal aantal punten mag bijdragen. Wanneer de WOZ-punten, berekend op basis van deel 1 plus deel 2, hoger zijn dan " +
        normen.wozCapPct +
        "% van het totaal, wordt de WOZ gecapt. Als de WOZ-cap ervoor zorgt dat het puntenaantal onder de " +
        (normen.grensMidden + 1) +
        " punten komt, en daardoor uit de vrije sector valt, wordt het puntenaantal gemaximaliseerd op " +
        normen.grensMidden +
        " punten.",
    ),
    breedte,
  );
  const cardH2 = 14 + deel1.length * 4.6 + deel2.length * 4.6 + 10 + capTxt.length * 4.6 + 8;
  if (y + 15 + cardH2 > 270) {
    doc.addPage();
    y = 20;
  }
  y = pdfKaartHeader(
    doc,
    M,
    y,
    "WOZ-waarde",
    "De berekening voor het puntenaantal op basis van de WOZ-waarde bestaat uit twee onderdelen.",
  );
  doc.setDrawColor(...CARDBORDER);
  doc.setLineWidth(0.4);
  doc.roundedRect(M, y, cardW, cardH2, 4, 4, "S");
  let wy = y + 11;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.5);
  doc.setTextColor(...INK);
  doc.text("Deel 1", M + padX, wy);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...INK);
  doc.text(deel1, M + padX + labelW, wy);
  wy += deel1.length * 4.6 + 2;
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...INK);
  doc.text("Deel 2", M + padX, wy);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...INK);
  doc.text(deel2, M + padX + labelW, wy);
  wy += deel2.length * 4.6 + 10;
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...INK);
  doc.text(normen.wozCapPct + "% WOZ-cap", M + padX, wy);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...INK);
  doc.text(capTxt, M + padX + labelW, wy);
  y += cardH2 + 8;
  return y;
}

/** Kleine puntenbalk met markering — pdfMiniGaugeRow() */
function pdfMiniGaugeRow(
  doc: Doc,
  x: number,
  y: number,
  w: number,
  label: string,
  totaal: number,
  normen: Normen,
): number {
  const PUR = PDF_PUR,
    INK = PDF_INK,
    MUT = PDF_MUT,
    SEGC = PDF_SEGC;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.5);
  doc.setTextColor(...INK);
  doc.text(label, x, y);
  const barY = y + 10,
    barH = 3.4,
    scale = Math.max(250, totaal + 20);
  const w1 = (w * normen.grensLaag) / scale,
    w2 = (w * (normen.grensMidden - normen.grensLaag)) / scale;
  doc.setFillColor(...SEGC.laag);
  doc.rect(x, barY, w1, barH, "F");
  doc.setFillColor(...SEGC.midden);
  doc.rect(x + w1, barY, w2, barH, "F");
  doc.setFillColor(...SEGC.hoog);
  doc.rect(x + w1 + w2, barY, w - w1 - w2, barH, "F");
  const mx = x + w * Math.min(1, totaal / scale);
  doc.setDrawColor(...INK);
  doc.setLineWidth(0.5);
  doc.line(mx, barY - 2.5, mx, barY + barH + 2.5);
  const bubTxt = String(totaal),
    bubW = doc.getTextWidth(bubTxt) * 0.6 + 7;
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(...PUR);
  doc.setLineWidth(0.3);
  const bubX = Math.min(Math.max(mx - bubW / 2, x - 2), x + w - bubW + 2),
    bubY = barY - 11.5;
  doc.roundedRect(bubX, bubY, bubW, 6, 2, 2, "FD");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(...INK);
  doc.text(bubTxt, bubX + bubW / 2, bubY + 4.2, { align: "center" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.5);
  doc.setTextColor(...MUT);
  doc.text("0-" + normen.grensLaag, x, barY + barH + 5);
  doc.text("sociale huur", x, barY + barH + 8.3);
  doc.text(normen.grensLaag + 1 + "-" + normen.grensMidden, x + w1 + w2 / 2, barY + barH + 5, {
    align: "center",
  });
  doc.text("middenhuur", x + w1 + w2 / 2, barY + barH + 8.3, { align: "center" });
  doc.text(normen.grensMidden + 1 + "+", x + w, barY + barH + 5, { align: "right" });
  doc.text("vrije sector", x + w, barY + barH + 8.3, { align: "right" });
  return y + 29;
}

/** Overzichtspagina met inhoudsopgave en de drie puntentotalen — pdfSamenvattingPagina() */
export function pdfSamenvattingPagina(
  doc: Doc,
  meta: TellingMeta,
  input: WwsInput,
  normen: Normen,
  R: WwsResultaat,
  route1: PdfRoute,
  route2: PdfRoute,
  sections: string[],
  img?: string | null,
): number {
  const W = PDF_W,
    M = PDF_M,
    INK = PDF_INK,
    LINE = PDF_LINE,
    SOFT = PDF_SOFT;
  const CARDBORDER: RGB = [214, 211, 255];
  doc.addPage();
  let y = pdfBanner(
    doc,
    "WWS-rapport",
    "Overzicht",
    "Samenvatting van de puntentelling en de verbeteropties",
  );
  // In de bron 'const hasImg' met een toewijzing in de catch (gooit); hier 'let'
  let hasImg = !!img;
  let imgW = 0,
    imgH = 0;
  if (hasImg && img) {
    try {
      const props = doc.getImageProperties(img);
      imgW = 70;
      imgH = Math.min(50, (imgW * props.height) / props.width);
    } catch {
      hasImg = false;
    }
  }
  const leftW = hasImg ? W - 2 * M - imgW - 8 : W - 2 * M;
  const rows = [
    ["Peildatum", meta.peildatum ? new Date(meta.peildatum).toLocaleDateString("nl-NL") : "-"],
    ["Woonvorm", input.woningtype === "eengezins" ? "Eengezinswoning" : "Meergezinswoning"],
    ["Vertrekken m²", fmt(R.oppV, 0)],
    [
      "Energielabel",
      input.energie && (input.energie.soort === "label" || input.energie.soort === "labelOud")
        ? input.energie.label
        : "n.v.t.",
    ],
  ];
  const startY = y;
  rows.forEach((r) => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9.5);
    doc.setTextColor(...INK);
    doc.text(pdfTxt(r[0]), M, y);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...INK);
    doc.text(pdfTxt(String(r[1])), M + 45, y);
    doc.setDrawColor(...LINE);
    doc.setLineWidth(0.2);
    doc.line(M, y + 2.3, M + leftW, y + 2.3);
    y += 8;
  });
  if (hasImg && img) {
    try {
      doc.addImage(img, "JPEG", M + leftW + 8, startY - 5, imgW, imgH);
    } catch {
      /* zoals de bron: afbeelding overslaan */
    }
  }
  y += 8;
  y = pdfKaartHeader(doc, M, y, "Inhoudsopgave");
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  doc.setTextColor(...INK);
  sections.forEach((s) => {
    const lines: string[] = doc.splitTextToSize(pdfTxt(s), W - 2 * M - 6);
    doc.text("-  " + lines[0], M, y);
    for (let k = 1; k < lines.length; k++) {
      doc.text(lines[k]!, M + 5, y + k * 5.2);
    }
    y += 5.8 + (lines.length - 1) * 5.2;
  });
  y += 8;
  y = pdfKaartHeader(doc, M, y, "Samenvatting");
  const cardH = 14 + 3 * 29;
  if (y + cardH > 270) {
    doc.addPage();
    y = 20;
  }
  doc.setDrawColor(...CARDBORDER);
  doc.setFillColor(...SOFT);
  doc.roundedRect(M, y, W - 2 * M, cardH, 5, 5, "FD");
  let by = y + 13;
  const items: [string, number][] = [
    ["Huidige status", R.totaal],
    ["Verbeteroptie 1", route1.eind.totaal],
    ["Verbeteroptie 2", route2.eind.totaal],
  ];
  items.forEach((it) => {
    by = pdfMiniGaugeRow(doc, M + 10, by, W - 2 * M - 20, it[0], it[1], normen);
  });
  return y + cardH + 8;
}

/** Invoer zoals de bron hem tekent: genormaliseerde kopie */
export const pdfInvoer = (input: WwsInput) => normaliseer(input);
