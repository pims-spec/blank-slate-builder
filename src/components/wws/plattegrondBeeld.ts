import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { WwsInput } from "@/lib/wws";
import { BUCKET, maakPlattegrondOpslag, PAD_RE, type Bucket } from "@/lib/wws/plattegrond/opslag";
import { paginaTitel, rapportPlattegronden } from "@/lib/wws/plattegrond/rapport";
import type { PdfRapportPlattegrond } from "@/lib/wws/pdf/delen";

/** Plattegronden in Storage, met het token van de ingelogde gebruiker (RLS) */
export const plattegrondOpslag = maakPlattegrondOpslag(
  supabase.storage.from(BUCKET) as unknown as Bucket,
);

/** Een nieuwe afbeelding die nog niet is opgeslagen (gaat bij "Opslaan" naar Storage) */
export interface NieuwBeeld {
  blob: Blob;
  breedte: number;
  hoogte: number;
}

/** Alleen echte afbeeldings-data-URL's uit oude tellingen (geen svg/javascript) */
const OUDE_URL = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;
export const oudeAfbeelding = (input: WwsInput): string | null =>
  typeof input.plattegrondImg === "string" && OUDE_URL.test(input.plattegrondImg)
    ? input.plattegrondImg
    : null;

const padVan = (input: WwsInput): string | null => {
  const p = input.plattegrond?.pad;
  return typeof p === "string" && PAD_RE.test(p) ? p : null;
};

export const heeftPlattegrond = (input: WwsInput, nieuw?: NieuwBeeld | null) =>
  !!nieuw || !!padVan(input) || !!oudeAfbeelding(input);

/** Blob → object-URL zolang het component bestaat */
function useObjectUrl(blob: Blob | null | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!blob) {
      setUrl(null);
      return;
    }
    const u = URL.createObjectURL(blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [blob]);
  return url;
}

/** URL om de plattegrond te tonen: nieuw (nog niet opgeslagen), uit Storage, of oud (data-URL) */
export function usePlattegrondUrl(
  input: WwsInput,
  nieuw?: NieuwBeeld | null,
): { url: string | null; laden: boolean; fout: boolean } {
  const pad = nieuw ? null : padVan(input);
  const q = useQuery({
    queryKey: ["plattegrond", pad],
    queryFn: () => plattegrondOpslag.haal(pad!),
    enabled: !!pad,
    staleTime: Infinity,
    retry: 1,
  });
  const url = useObjectUrl(nieuw ? nieuw.blob : (q.data ?? null));
  if (nieuw || pad) return { url, laden: !!pad && q.isPending, fout: q.isError };
  return { url: oudeAfbeelding(input), laden: false, fout: false };
}

/**
 * De plattegrond als JPEG-data-URL voor de PDF's (pdfPlattegrondBlok verwacht JPEG). Oude PNG-
 * afbeeldingen worden omgezet. null als er geen is of hij niet te lezen is.
 */
export async function plattegrondVoorPdf(
  input: WwsInput,
  nieuw?: NieuwBeeld | null,
): Promise<string | null> {
  try {
    let blob: Blob | null = nieuw?.blob ?? null;
    const pad = padVan(input);
    if (!blob && pad) blob = await plattegrondOpslag.haal(pad);
    if (!blob) {
      const oud = oudeAfbeelding(input);
      if (!oud) return null;
      blob = await (await fetch(oud)).blob();
    }
    return await jpegDataUrl(blob);
  } catch (e) {
    console.warn("[plattegrond] niet te lezen voor de PDF", e instanceof Error ? e.name : "");
    return null;
  }
}

/** Afbeelding → JPEG-data-URL op een witte achtergrond (jsPDF tekent JPEG) */
async function jpegDataUrl(blob: Blob): Promise<string> {
  const bm = await createImageBitmap(blob);
  const c = document.createElement("canvas");
  c.width = bm.width;
  c.height = bm.height;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(bm, 0, 0);
  bm.close();
  return c.toDataURL("image/jpeg", 0.85);
}

/**
 * De plattegronden voor het rapport met hun paginatitel, voor de PDF's. Een afbeelding die niet
 * te lezen is, wordt overgeslagen (met een waarschuwing in de console, zonder details).
 */
export async function rapportPlattegrondenVoorPdf(
  input: WwsInput,
): Promise<PdfRapportPlattegrond[]> {
  const uit: PdfRapportPlattegrond[] = [];
  for (const p of rapportPlattegronden(input)) {
    try {
      const img = await jpegDataUrl(await plattegrondOpslag.haal(p.pad));
      uit.push({ titel: paginaTitel(uit.length + 1, p), img });
    } catch (e) {
      console.warn(
        "[plattegrond] rapport-plattegrond niet te lezen",
        e instanceof Error ? e.name : "",
      );
    }
  }
  return uit;
}
