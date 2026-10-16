// Server functions voor de Bloxs OData-feed. Stap 1: alleen voor beheerders, alleen de structuur
// (namen van entiteiten en velden) en een verbindingstest. Geen rijen, geen waarden. De rol wordt
// gecontroleerd met de Supabase-client MET het token van de gebruiker — nooit de service role.
import { createServerFn } from "@tanstack/react-start";
import { vereisAdmin } from "../rollenMiddleware";
import { bloxsConfig, bloxsStructuur, testBloxs } from "./bron";

export const bloxsVerbindingTesten = createServerFn({ method: "POST" })
  .middleware([vereisAdmin])
  .handler(async () => {
    const cfg = bloxsConfig(process.env);
    if (!cfg.ok) return cfg;
    return testBloxs(fetch, cfg.data);
  });

export const bloxsStructuurOphalen = createServerFn({ method: "POST" })
  .middleware([vereisAdmin])
  .handler(async () => {
    const cfg = bloxsConfig(process.env);
    if (!cfg.ok) return cfg;
    return bloxsStructuur(fetch, cfg.data);
  });
