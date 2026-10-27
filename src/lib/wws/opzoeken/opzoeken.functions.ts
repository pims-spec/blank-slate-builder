// Server functions voor adres (PDOK), energielabel (EP-Online) en monumentstatus (Kadaster en
// RCE), plus een status-check van de secrets voor beheerders. Elke aanroep vereist een ingelogde gebruiker; de rol wordt gecontroleerd
// met de Supabase-client MET het token van die gebruiker (RLS geldt) — nooit de service role.
import { createServerFn } from "@tanstack/react-start";
import { STANDAARD_CLAUDE_MODEL, STANDAARD_GEMINI_MODEL } from "../ai/dienst";
import { bloxsSecretsAanwezig } from "../bloxs/bron";
import { vereisAdmin, vereisSchrijfrol } from "../rollenMiddleware";
import {
  AdresVraagSchema,
  EpVraagSchema,
  zoekAdresBijPdok,
  zoekEnergielabelBijEpOnline,
} from "./dienst";
import { zoekCoropGegevens } from "./corop";
import { zoekMonumentStatus } from "./monument";

export const zoekAdres = createServerFn({ method: "POST" })
  .middleware([vereisSchrijfrol])
  .validator((d: unknown) => AdresVraagSchema.parse(d))
  .handler(async ({ data }) => zoekAdresBijPdok(fetch, data));

export const zoekEnergielabel = createServerFn({ method: "POST" })
  .middleware([vereisSchrijfrol])
  .validator((d: unknown) => EpVraagSchema.parse(d))
  .handler(async ({ data }) =>
    zoekEnergielabelBijEpOnline(fetch, process.env["EP_ONLINE_API_KEY"], data),
  );

/** Rijks- of gemeentelijk monument en beschermd stadsgezicht bij een adres (geen sleutel nodig) */
export const zoekMonument = createServerFn({ method: "POST" })
  .middleware([vereisSchrijfrol])
  .validator((d: unknown) => EpVraagSchema.parse(d))
  .handler(async ({ data }) => zoekMonumentStatus(fetch, data));

/** Gemeente en BAG-bouwjaar bij een adres, voor het kengetal kleine nieuwbouw COROP */
export const zoekCorop = createServerFn({ method: "POST" })
  .middleware([vereisSchrijfrol])
  .validator((d: unknown) => EpVraagSchema.parse(d))
  .handler(async ({ data }) => zoekCoropGegevens(fetch, data));

/** Welke secrets zijn ingesteld (alleen aanwezig of niet — nooit de waarde), en welke modellen */
export const serverStatus = createServerFn({ method: "POST" })
  .middleware([vereisAdmin])
  .handler(async () => ({
    sleutels: {
      EP_ONLINE_API_KEY: !!process.env["EP_ONLINE_API_KEY"],
      ANTHROPIC_API_KEY: !!process.env["ANTHROPIC_API_KEY"],
      GEMINI_API_KEY: !!process.env["GEMINI_API_KEY"],
      ...bloxsSecretsAanwezig(process.env),
    },
    // modelnamen zijn geen geheim; zo is te zien of CLAUDE_MODEL/GEMINI_IMAGE_MODEL doorkomen
    modellen: {
      CLAUDE_MODEL: process.env["CLAUDE_MODEL"] || STANDAARD_CLAUDE_MODEL + " (standaard)",
      GEMINI_IMAGE_MODEL:
        process.env["GEMINI_IMAGE_MODEL"] || STANDAARD_GEMINI_MODEL + " (standaard)",
    },
  }));
