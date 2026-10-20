// Server function voor de huurprijsindicator: woninggegevens opzoeken (PDOK, BAG, EP-Online).
// Ingelogd, schrijfrol en tweestapsverificatie (vereisSchrijfrol); geen service role. De kijkrol
// kan indicaties bekijken, niet maken.
import { createServerFn } from "@tanstack/react-start";
import { vereisSchrijfrol } from "../rollenMiddleware";
import { HuurVraagSchema, zoekHuurWoning } from "./opzoeken";

export const zoekWoningVoorHuur = createServerFn({ method: "POST" })
  .middleware([vereisSchrijfrol])
  .validator((d: unknown) => HuurVraagSchema.parse(d))
  .handler(async ({ data }) => zoekHuurWoning(fetch, process.env["EP_ONLINE_API_KEY"], data));
