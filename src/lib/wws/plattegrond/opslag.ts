// Plattegrond-afbeeldingen in de privé Storage-bucket "plattegronden". Een telling bewaart
// alleen een verwijzing (input.plattegrond = { pad, breedte, hoogte }), nooit de afbeelding
// zelf. Pad: "<telling-id>/<uuid>.<jpg|png|webp>" — dezelfde vorm die telling_id_uit_pad() in
// de database accepteert; wie mag lezen/schrijven volgt uit mag_telling_zien/_bewerken.
//
// De bucket zelf beperkt de bestandstypen niet: hier wordt vóór elke upload aan de eerste
// bytes gecontroleerd of het echt een JPEG, PNG of WebP is, en het contentType expliciet
// meegegeven.

export type Afbeeldingstype = "image/jpeg" | "image/png" | "image/webp";

export interface PlattegrondRef {
  pad: string;
  breedte: number;
  hoogte: number;
}

export const BUCKET = "plattegronden";
/** Zelfde grens als de bucket */
export const MAX_BYTES = 10 * 1024 * 1024;

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
/** Zelfde patroon als telling_id_uit_pad() in de database */
export const PAD_RE = new RegExp(`^(${UUID})/${UUID}\\.(jpg|png|webp)$`);
const UUID_RE = new RegExp(`^${UUID}$`);

const EXTENSIE: Record<Afbeeldingstype, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

/** Herkent JPEG, PNG en WebP aan de eerste bytes (magic bytes); anders null */
export function herkenAfbeelding(b: Uint8Array): Afbeeldingstype | null {
  const is = (offset: number, bytes: number[]) =>
    b.length >= offset + bytes.length && bytes.every((x, i) => b[offset + i] === x);
  if (is(0, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (is(0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  // "RIFF" <4 bytes grootte> "WEBP"
  if (is(0, [0x52, 0x49, 0x46, 0x46]) && is(8, [0x57, 0x45, 0x42, 0x50])) return "image/webp";
  return null;
}

/** Nieuw pad voor een afbeelding van deze telling */
export function nieuwPad(
  tellingId: string,
  type: Afbeeldingstype,
  uuid: string = crypto.randomUUID(),
): string {
  const pad = `${tellingId}/${uuid}.${EXTENSIE[type]}`;
  if (!PAD_RE.test(pad)) throw new Error("Ongeldig pad voor een plattegrond.");
  return pad;
}

/** Hoort dit pad bij deze telling? (een verwijzing uit een telling is onbetrouwbare invoer) */
export const padVanTelling = (pad: unknown, tellingId: string): pad is string =>
  typeof pad === "string" && PAD_RE.exec(pad)?.[1] === tellingId;

/** Het deel van de Supabase-Storage-API dat hier gebruikt wordt (storage.from(bucket)) */
export interface Bucket {
  upload(
    pad: string,
    body: Blob,
    opties: { contentType: string; upsert: boolean; cacheControl?: string },
  ): Promise<{ error: unknown }>;
  download(pad: string): Promise<{ data: Blob | null; error: unknown }>;
  list(
    map: string,
    opties: { limit: number; offset: number },
  ): Promise<{ data: { name: string }[] | null; error: unknown }>;
  remove(paden: string[]): Promise<{ error: unknown }>;
}

export class GeenAfbeeldingFout extends Error {
  constructor() {
    super("Dit bestand is geen JPEG-, PNG- of WebP-afbeelding.");
  }
}

export function maakPlattegrondOpslag(bucket: Bucket) {
  return {
    /**
     * Uploadt een afbeelding voor deze telling. Controleert eerst de echte inhoud (magic
     * bytes) en de grootte; het contentType komt uit die controle, niet uit de bestandsnaam.
     */
    async bewaar(
      tellingId: string,
      bytes: Uint8Array,
      maat: { breedte: number; hoogte: number },
    ): Promise<PlattegrondRef> {
      if (!UUID_RE.test(tellingId)) throw new Error("Ongeldige telling.");
      const type = herkenAfbeelding(bytes);
      if (!type) throw new GeenAfbeeldingFout();
      if (bytes.length > MAX_BYTES) throw new Error("Deze afbeelding is groter dan 10 MB.");
      const pad = nieuwPad(tellingId, type);
      const { error } = await bucket.upload(pad, new Blob([bytes as BlobPart], { type }), {
        contentType: type,
        upsert: false,
        cacheControl: "3600",
      });
      if (error) throw error;
      return { pad, breedte: Math.round(maat.breedte), hoogte: Math.round(maat.hoogte) };
    },

    /** De afbeelding ophalen (RLS: alleen wie de telling mag zien) */
    async haal(pad: string): Promise<Blob> {
      if (!PAD_RE.test(pad)) throw new Error("Ongeldig pad voor een plattegrond.");
      const { data, error } = await bucket.download(pad);
      if (error) throw error;
      if (!data) throw new Error("De plattegrond is niet gevonden.");
      return data;
    },

    async verwijder(paden: string[]): Promise<void> {
      const geldig = paden.filter((p) => PAD_RE.test(p));
      if (!geldig.length) return;
      const { error } = await bucket.remove(geldig);
      if (error) throw error;
    },

    /** Alle afbeeldingen van een telling verwijderen (vóór het verwijderen van de telling) */
    async verwijderMap(tellingId: string): Promise<void> {
      if (!UUID_RE.test(tellingId)) return; // oude, niet-uuid id's hebben nooit afbeeldingen
      for (;;) {
        // na elke ronde is de map kleiner: altijd vanaf het begin lezen
        const { data, error } = await bucket.list(tellingId, { limit: 100, offset: 0 });
        if (error) throw error;
        const paden = (data ?? [])
          .map((f) => `${tellingId}/${f.name}`)
          .filter((p) => PAD_RE.test(p));
        if (!paden.length) return;
        const r = await bucket.remove(paden);
        if (r.error) throw r.error;
      }
    },
  };
}

export type PlattegrondOpslag = ReturnType<typeof maakPlattegrondOpslag>;

/**
 * Welke oude afbeelding mag weg na het vervangen? Alleen als geen enkele vastgelegde versie
 * er nog naar verwijst (anders verliest die versie-PDF zijn plattegrond).
 */
export function oudeAfbeeldingOpruimen(
  oud: PlattegrondRef | null | undefined,
  nieuw: PlattegrondRef | null | undefined,
  versiePaden: readonly (string | undefined)[],
): string[] {
  if (!oud || !oud.pad || oud.pad === nieuw?.pad) return [];
  return versiePaden.includes(oud.pad) ? [] : [oud.pad];
}
