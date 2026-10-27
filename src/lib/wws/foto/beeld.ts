// Foto's voor de fotobeoordeling in de browser klaarmaken: verkleinen tot hoogstens 1.568 px (meer
// gebruikt de AI toch niet) en opnieuw opslaan als JPEG. Door het opnieuw tekenen gaan de GPS-
// locatie en alle andere metadata (EXIF) eruit. De draaiing van de camera wordt wel toegepast.
import { blobNaarBytes, bytesNaarBase64, canvasNaarJpeg } from "../plattegrond/beeld";

export const FOTO_MAX_ZIJDE = 1568;

export interface KlareFoto {
  /** base64, zonder "data:"-voorvoegsel */
  data: string;
  type: "image/jpeg";
}

/** Nieuwe maten: de langste zijde hoogstens max, verhouding gelijk, nooit groter */
export function verkleinMaten(w: number, h: number, max = FOTO_MAX_ZIJDE) {
  const schaal = Math.min(1, max / Math.max(w, h));
  return { w: Math.max(1, Math.round(w * schaal)), h: Math.max(1, Math.round(h * schaal)) };
}

export async function fotoKlaarmaken(file: Blob): Promise<KlareFoto> {
  let bm: ImageBitmap;
  try {
    bm = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new Error("Dit bestand is geen foto die de browser kan lezen.");
  }
  try {
    if (!bm.width || !bm.height) throw new Error("Deze foto kon niet worden gelezen.");
    const { w, h } = verkleinMaten(bm.width, bm.height);
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(bm, 0, 0, w, h);
    const jpeg = await canvasNaarJpeg(c, 0.85);
    return { data: bytesNaarBase64(await blobNaarBytes(jpeg)), type: "image/jpeg" };
  } finally {
    bm.close();
  }
}
