// Server functions voor de Bloxs OData-feed. Structuur en verbindingstest: alleen voor beheerders,
// alleen namen (geen rijen, geen waarden). Sync: met een schrijfrol, alleen de velden uit de
// allowlist (odata.ts), en elke aanroep meldt hoeveel aanvragen er naar Bloxs gingen. De rol wordt
// gecontroleerd met de Supabase-client MET het token van de gebruiker — nooit de service role.
import { createServerFn } from "@tanstack/react-start";
import * as z from "zod";
import { leesPortefeuilleNormen } from "../portefeuille/normenDb";
import { wachtMs } from "../portefeuille/ophalen";
import { vereisAdmin, vereisSchrijfrol } from "../rollenMiddleware";
import { bloxsConfig, bloxsStructuur, testBloxs } from "./bron";
import type { BloxsFout } from "./fouten";
import { IdSchema } from "./odata";
import {
  MAX_ADRESSEN,
  haalAdressen,
  haalEigenaren,
  haalObjectenPagina,
  testFuncties,
  testToegang,
  type Omgeving,
} from "./sync";

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

/** Diagnose: toegang per entiteit uit de allowlist ($top=0, geen rijen); alleen beheerders */
export const bloxsToegangTesten = createServerFn({ method: "POST" })
  .middleware([vereisAdmin])
  .handler(async ({ context }) => {
    const o = await omgeving(context.supabase);
    return typeof o === "string"
      ? { ok: false as const, fout: o }
      : { ok: true as const, data: await testToegang(o) };
  });

// --- Sync (stap 2): ingelogd met een schrijfrol, zod op invoer, limiet per seconde uit Normen ---

const slaap = (ms: number) => new Promise((ok) => setTimeout(ok, ms));

async function omgeving(
  db: Parameters<typeof leesPortefeuilleNormen>[0],
): Promise<Omgeving | BloxsFout> {
  const cfg = bloxsConfig(process.env);
  if (!cfg.ok) return cfg.fout;
  const n = await leesPortefeuilleNormen(db);
  return { fetchFn: fetch, cfg: cfg.data, wacht: wachtMs(n.bloxsPerSeconde), slaap };
}

const geen = (fout: BloxsFout) => ({ ok: false as const, fout, aanvragen: 0 });

/** Eerst: werken $select, $filter en $top? ($top=0, geen rijen) */
export const bloxsFunctiesTesten = createServerFn({ method: "POST" })
  .middleware([vereisSchrijfrol])
  .handler(async ({ context }) => {
    const o = await omgeving(context.supabase);
    return typeof o === "string" ? geen(o) : testFuncties(o);
  });

/** Eigenaren voor de keuzelijst: alleen id, referentie en naam */
export const bloxsEigenaren = createServerFn({ method: "POST" })
  .middleware([vereisSchrijfrol])
  .handler(async ({ context }) => {
    const o = await omgeving(context.supabase);
    return typeof o === "string" ? geen(o) : haalEigenaren(o);
  });

const CursorSchema = z.union([
  z.object({ skip: z.number().int().min(0).max(10_000_000) }),
  z.object({ link: z.string().url().max(4000) }),
]);

export const bloxsObjectenPagina = createServerFn({ method: "POST" })
  .middleware([vereisSchrijfrol])
  .validator((d: unknown) =>
    z
      .object({
        soort: z.enum(["unit", "building"]),
        eigenaar: IdSchema,
        complex: IdSchema.nullable(),
        cursor: CursorSchema,
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const o = await omgeving(context.supabase);
    return typeof o === "string" ? geen(o) : haalObjectenPagina(o, data);
  });

export const bloxsAdressen = createServerFn({ method: "POST" })
  .middleware([vereisSchrijfrol])
  .validator((d: unknown) => z.object({ ids: z.array(IdSchema).min(1).max(MAX_ADRESSEN) }).parse(d))
  .handler(async ({ data, context }) => {
    const o = await omgeving(context.supabase);
    return typeof o === "string" ? geen(o) : haalAdressen(o, data.ids);
  });
