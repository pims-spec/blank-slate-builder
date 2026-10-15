// Het blokkenschema van een indelingsvariant als afbeelding (PNG), zodat er na het toepassen
// weer een "plattegrond" bij de telling hoort — indelingSchemaDataUrl(), indelingTekenKamerblok()
// en indelingWrapCanvasText() uit wws-site.html, letterlijk overgezet. Het canvas wordt
// meegegeven, zodat dit in tests met een nep-canvas te vergelijken is met de bron.
import { fmt, num, overigType, vertrekType } from "./basis";
import {
  bboxOk,
  buitenrand,
  unieBbox,
  vloerplanLayout,
  type Bbox,
  type IndelingRij,
} from "./indeling";

/** Het deel van CanvasRenderingContext2D dat het schema gebruikt */
export interface SchemaCtx {
  fillStyle: string | CanvasGradient | CanvasPattern;
  strokeStyle: string | CanvasGradient | CanvasPattern;
  lineWidth: number;
  font: string;
  textAlign: CanvasTextAlign;
  setLineDash(s: number[]): void;
  fillRect(x: number, y: number, w: number, h: number): void;
  strokeRect(x: number, y: number, w: number, h: number): void;
  beginPath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  arc(x: number, y: number, r: number, a0: number, a1: number, ccw?: boolean): void;
  stroke(): void;
  fillText(t: string, x: number, y: number): void;
  measureText(t: string): { width: number };
}
export interface SchemaCanvas {
  width: number;
  height: number;
  getContext(soort: "2d"): SchemaCtx | null;
  toDataURL(type: string): string;
}

interface Blok {
  label: string;
  m2: number;
  vast: boolean;
  nieuw: boolean;
  bbox: Bbox | undefined;
}

function wrapTekst(ctx: SchemaCtx, text: string, cx: number, cy: number, maxWidth: number) {
  const words = String(text || "").split(" ");
  const lines: string[] = [];
  let line = "";
  words.forEach((w) => {
    const test = line ? line + " " + w : w;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = w;
    } else line = test;
  });
  if (line) lines.push(line);
  const used = lines.slice(0, 2);
  const lh = 14;
  const startY = cy - ((used.length - 1) * lh) / 2;
  used.forEach((l, i) => ctx.fillText(l, cx, startY + i * lh));
}

/** Eén kamerblok: vlak, dubbele muur, deur- en raamsymbool, naam en m² — indelingTekenKamerblok() */
function tekenKamerblok(
  ctx: SchemaCtx,
  x: number,
  y: number,
  w: number,
  h: number,
  b: Blok,
  buiten: ReturnType<typeof buitenrand>,
) {
  ctx.fillStyle = b.vast ? "#e4e4ec" : "#e3e3f6";
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = b.vast ? "#6b6b86" : "#6b6ba8";
  ctx.lineWidth = 4;
  ctx.setLineDash(b.nieuw ? [8, 5] : []);
  ctx.strokeRect(x, y, w, h);
  if (w > 16 && h > 16) {
    ctx.lineWidth = 1;
    ctx.setLineDash([]);
    ctx.strokeStyle = "rgba(31,31,51,.25)";
    ctx.strokeRect(x + 3, y + 3, w - 6, h - 6);
  }
  ctx.setLineDash([]);
  if (w > 34 && h > 34) {
    const deurBreedte = Math.min(26, Math.min(w, h) * 0.35);
    const verticaleWand = h >= w;
    ctx.strokeStyle = "#1f1f33";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    if (verticaleWand) {
      ctx.moveTo(x, y + 6);
      ctx.lineTo(x, y + 6 + deurBreedte);
      ctx.moveTo(x, y + 6 + deurBreedte);
      ctx.arc(x, y + 6, deurBreedte, Math.PI / 2, 0, true);
    } else {
      ctx.moveTo(x + 6, y);
      ctx.lineTo(x + 6 + deurBreedte, y);
      ctx.moveTo(x + 6 + deurBreedte, y);
      ctx.arc(x + 6, y, deurBreedte, 0, Math.PI / 2, false);
    }
    ctx.stroke();
  }
  if (buiten && w > 30 && h > 30) {
    ctx.strokeStyle = "#1f1f33";
    ctx.lineWidth = 1.5;
    const ramen = (cx: number, cy: number, horiz: boolean) => {
      ctx.beginPath();
      if (horiz) {
        ctx.moveTo(cx - 14, cy - 2);
        ctx.lineTo(cx + 14, cy - 2);
        ctx.moveTo(cx - 14, cy + 2);
        ctx.lineTo(cx + 14, cy + 2);
      } else {
        ctx.moveTo(cx - 2, cy - 14);
        ctx.lineTo(cx - 2, cy + 14);
        ctx.moveTo(cx + 2, cy - 14);
        ctx.lineTo(cx + 2, cy + 14);
      }
      ctx.stroke();
    };
    if (buiten === "boven") ramen(x + w / 2, y, true);
    else if (buiten === "onder") ramen(x + w / 2, y + h, true);
    else if (buiten === "links") ramen(x, y + h / 2, false);
    else if (buiten === "rechts") ramen(x + w, y + h / 2, false);
  }
  ctx.fillStyle = "#1f1f33";
  ctx.textAlign = "center";
  const metLabel = w > 50 && h > 26;
  if (metLabel) {
    ctx.font = "bold 13px sans-serif";
    wrapTekst(ctx, b.label, x + w / 2, y + h / 2 - 6, Math.max(20, w - 10));
  }
  if (w > 40 && h > 14) {
    ctx.font = "12px sans-serif";
    ctx.fillText(fmt(b.m2) + " m²", x + w / 2, y + h / 2 + (metLabel ? 18 : 4));
  }
}

/**
 * Het schema als PNG-data-URL, of null — indelingSchemaDataUrl(). Vaste ruimten met een bbox
 * staan op hun echte plek; de rest proportioneel binnen het gebied van de vrije ruimten.
 */
export function schemaDataUrl(
  maakCanvas: () => SchemaCanvas,
  vertrekken: readonly IndelingRij[],
  overig: readonly IndelingRij[],
  origineleRooms: readonly { status: string; bbox?: unknown }[],
): string | null {
  try {
    const blok = (r: IndelingRij, l: string): Blok => ({
      label: r.naam || l,
      m2: num(r.m2),
      vast: !!r._indVast,
      nieuw: !!r._indNieuw,
      bbox: r.bbox,
    });
    const alleRooms = vertrekken
      .map((r) => blok(r, vertrekType(r.type).l))
      .concat(overig.map((r) => blok(r, overigType(r.type).l)))
      .filter((b) => b.m2 > 0);
    if (!alleRooms.length) return null;
    const orig = origineleRooms || [];
    const geheelUnie = unieBbox(orig);
    const vrijUnie = unieBbox(orig.filter((r) => r.status === "vrij"));
    const PAD = 10,
      W = 1000;
    const H = geheelUnie
      ? Math.round(
          Math.min(900, Math.max(320, (W - 2 * PAD) * (geheelUnie.h / geheelUnie.w) + 2 * PAD)),
        )
      : 620;
    const canvas = maakCanvas();
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext && canvas.getContext("2d");
    if (!ctx) return null;
    ctx.fillStyle = "#f4f4f8";
    ctx.fillRect(0, 0, W, H);
    const innerW = W - PAD * 2,
      innerH = H - PAD * 2;
    const naarCanvas = (fx: number, fy: number): [number, number] =>
      geheelUnie
        ? [
            PAD + ((fx - geheelUnie.x) / geheelUnie.w) * innerW,
            PAD + ((fy - geheelUnie.y) / geheelUnie.h) * innerH,
          ]
        : [PAD + fx * innerW, PAD + fy * innerH];
    const metBbox = alleRooms.filter((b) => b.vast && bboxOk(b.bbox));
    const zonderBbox = alleRooms.filter((b) => !(b.vast && bboxOk(b.bbox)));
    const geplaatst: { x: number; y: number; w: number; h: number; b: Blok }[] = [];
    metBbox.forEach((b) => {
      const bb = b.bbox!;
      const [x, y] = naarCanvas(bb.x, bb.y);
      const [x2, y2] = naarCanvas(bb.x + bb.w, bb.y + bb.h);
      geplaatst.push({ x, y, w: Math.max(1, x2 - x - 3), h: Math.max(1, y2 - y - 3), b });
    });
    if (zonderBbox.length) {
      let stripX = PAD,
        stripY = PAD,
        stripW = innerW,
        stripH = innerH;
      if (vrijUnie) {
        const [sx, sy] = naarCanvas(vrijUnie.x, vrijUnie.y);
        const [sx2, sy2] = naarCanvas(vrijUnie.x + vrijUnie.w, vrijUnie.y + vrijUnie.h);
        stripX = sx;
        stripY = sy;
        stripW = Math.max(60, sx2 - sx);
        stripH = Math.max(60, sy2 - sy);
      } else if (metBbox.length) {
        const laagsteOnder = Math.max(...geplaatst.map((g) => g.y + g.h));
        stripY = Math.min(laagsteOnder, PAD + innerH - 60);
        stripH = Math.max(60, PAD + innerH - stripY);
      }
      const vlak = vloerplanLayout(zonderBbox, stripW, stripH);
      zonderBbox.forEach((b, i) => {
        const r = vlak[i];
        if (!r) return;
        const x = stripX + r.x,
          y = stripY + r.y,
          w = Math.max(1, r.w - 3),
          h = Math.max(1, r.h - 3);
        geplaatst.push({ x, y, w, h, b });
      });
    }
    geplaatst.forEach(({ x, y, w, h, b }) => {
      tekenKamerblok(ctx, x, y, w, h, b, buitenrand(x, y, w, h, W, H, PAD));
    });
    ctx.strokeStyle = "#1f1f33";
    ctx.lineWidth = 4;
    ctx.setLineDash([]);
    ctx.strokeRect(PAD / 2, PAD / 2, W - PAD, H - PAD);
    return canvas.toDataURL("image/png");
  } catch {
    return null;
  }
}
