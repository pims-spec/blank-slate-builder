// Google Drive voor "Map inlezen": de instellingen en de antwoorden van de Google Picker. Het
// toegangstoken (scope drive.file: alleen de bestanden die de gebruiker in de Picker kiest) blijft
// in het geheugen van de browser; de bestanden gaan rechtstreeks van Drive naar de browser. Alles
// wat van Google komt is onbetrouwbare data en gaat door zod. Het laden van de scripts en het
// downloaden staat in googleDrive.ts.
import * as z from "zod";
import type { MapBestand } from "./verdelen";

/** Alleen de bestanden die de gebruiker zelf kiest; Google hoeft de app daarvoor niet te keuren */
export const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";
/** Wat de Picker laat zien (mappen altijd, om in te bladeren) */
export const PICKER_MIME = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "application/pdf",
].join(",");

export interface DriveInstellingen {
  clientId: string;
  apiKey: string;
  /** Het projectnummer van het Google Cloud-project (nodig bij drive.file) */
  appId: string;
}

const Instellingen = z.object({
  VITE_GOOGLE_CLIENT_ID: z
    .string()
    .trim()
    .regex(/^[\w-]+\.apps\.googleusercontent\.com$/),
  VITE_GOOGLE_API_KEY: z
    .string()
    .trim()
    .regex(/^[\w-]{20,100}$/),
  VITE_GOOGLE_APP_ID: z
    .string()
    .trim()
    .regex(/^\d{5,20}$/),
});

/** De publieke Google-instellingen uit de omgeving; null als ze (nog) ontbreken of niet kloppen */
export function driveInstellingen(env: Record<string, unknown>): DriveInstellingen | null {
  const r = Instellingen.safeParse(env);
  if (!r.success) return null;
  return {
    clientId: r.data.VITE_GOOGLE_CLIENT_ID,
    apiKey: r.data.VITE_GOOGLE_API_KEY,
    appId: r.data.VITE_GOOGLE_APP_ID,
  };
}

const DriveId = z.string().regex(/^[\w-]{10,200}$/);

const PickerDoc = z.object({
  id: DriveId,
  name: z.string().min(1).max(500),
  mimeType: z.string().max(200),
  sizeBytes: z.coerce.number().int().nonnegative().optional(),
});

export interface DriveBestand extends MapBestand {
  id: string;
}

const PickerAntwoord = z.discriminatedUnion("action", [
  z.object({ action: z.literal("picked"), docs: z.array(z.unknown()).max(500) }),
  z.object({ action: z.literal("cancel") }),
]);

/**
 * Het antwoord van de Picker. "gekozen" met de bestanden (onbruikbare regels, zoals een map of een
 * vreemd id, vallen weg), "geannuleerd", of null voor tussenberichten (bijv. "loaded").
 */
export function leesPickerAntwoord(
  data: unknown,
): { status: "gekozen"; bestanden: DriveBestand[] } | { status: "geannuleerd" } | null {
  const r = PickerAntwoord.safeParse(data);
  if (!r.success) return null;
  if (r.data.action === "cancel") return { status: "geannuleerd" };
  const bestanden: DriveBestand[] = [];
  const gezien = new Set<string>();
  for (const d of r.data.docs) {
    const doc = PickerDoc.safeParse(d);
    if (!doc.success || gezien.has(doc.data.id)) continue;
    if (doc.data.mimeType === "application/vnd.google-apps.folder") continue;
    gezien.add(doc.data.id);
    bestanden.push({
      id: doc.data.id,
      pad: doc.data.name.replace(/\//g, "-"),
      type: doc.data.mimeType,
      grootte: doc.data.sizeBytes ?? 0,
    });
  }
  return { status: "gekozen", bestanden };
}

/** De inhoud van een bestand (alleen met een gecontroleerd id) */
export function downloadUrl(id: string): string {
  return "https://www.googleapis.com/drive/v3/files/" + DriveId.parse(id) + "?alt=media";
}

const TokenAntwoord = z.object({
  access_token: z.string().min(10).max(4096).optional(),
  error: z.string().max(200).optional(),
});

/** Het antwoord van Google Identity Services; null als er geen bruikbaar token is */
export function leesToken(data: unknown): string | null {
  const r = TokenAntwoord.safeParse(data);
  return r.success && !r.data.error && r.data.access_token ? r.data.access_token : null;
}
