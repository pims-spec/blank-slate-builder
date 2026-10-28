// Eén verdieping uit een samengestelde plattegrond halen, in de browser (canvas). De berekening
// staat in verdiepingen.ts (zonderVerdieping).
import type { PlatVerdieping } from "../types";
import { canvasNaarJpeg } from "./beeld";
import { zonderVerdieping } from "./verdiepingen";

/**
 * Eén verdieping uit een samengestelde plattegrond halen: de andere tekeningen worden uit de
 * afbeelding geknipt en opnieuw onder elkaar gezet (zonderVerdieping). Geeft een nieuwe JPEG.
 */
export async function knipVerdiepingWeg(
  blob: Blob,
  verdiepingen: readonly PlatVerdieping[],
  i: number,
): Promise<{ blob: Blob; breedte: number; hoogte: number; verdiepingen?: PlatVerdieping[] }> {
  const plan = zonderVerdieping(verdiepingen, i);
  const bm = await createImageBitmap(blob);
  try {
    const c = document.createElement("canvas");
    c.width = plan.breedte;
    c.height = plan.hoogte;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.fillStyle = "#111";
    ctx.font = `600 ${Math.max(10, Math.round(plan.kop * 0.5))}px sans-serif`;
    for (const { bron, doel } of plan.stukken) {
      if (plan.kop) ctx.fillText(bron.naam, Math.round(plan.kop * 0.3), doel.kopY);
      ctx.drawImage(bm, bron.x, bron.y, bron.w, bron.h, doel.x, doel.y, doel.w, doel.h);
    }
    const uit = { blob: await canvasNaarJpeg(c), breedte: c.width, hoogte: c.height };
    return plan.verdiepingen ? { ...uit, verdiepingen: plan.verdiepingen } : uit;
  } finally {
    bm.close();
  }
}
