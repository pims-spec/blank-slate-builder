// De stappen van een Bloxs-sync aan de serverkant (fetch en slapen zijn in te voeren voor tests).
// Elke stap wacht vóór elke aanvraag (limiet per seconde uit Normen), telt de aanvragen, vraagt
// alleen velden uit de allowlist op en geeft alleen wat nodig is terug. Fouten zijn vaste codes.
import * as z from "zod";
import { normaliseerAdres, schoonNaam, type PortefeuilleAdres } from "../portefeuille/adres";
import { vandaag } from "../portefeuille/datum";
import { haalBloxsUrl, type BloxsConfig, type BloxsUitkomst } from "./bron";
import type { BloxsFout } from "./fouten";
import {
  ALLOWLIST,
  IdSchema,
  leesPagina,
  volgendeLinkOk,
  vraagUrl,
  zelfdeId,
  type BloxsId,
  type Entiteit,
  type Filter,
  type Vraag,
} from "./odata";

const ACCEPT = "application/json;odata.metadata=minimal";
const MAX_PAGINA_TEKENS = 5_000_000;
/** Rijen per pagina */
export const PAGINA = 500;
/** Adressen per aanvraag */
export const MAX_ADRESSEN = 50;

export interface Omgeving {
  fetchFn: typeof fetch;
  cfg: BloxsConfig;
  /** ms wachten vóór elke aanvraag */
  wacht: number;
  slaap: (ms: number) => Promise<unknown>;
}

/** Elke uitkomst vermeldt hoeveel aanvragen er naar Bloxs gingen */
export type Stap<T> = ({ ok: true; data: T } | { ok: false; fout: BloxsFout }) & {
  aanvragen: number;
};

async function pagina<E extends Entiteit>(
  o: Omgeving,
  url: string,
  v: Pick<Vraag<E>, "entiteit" | "velden">,
  voldoet: (r: Record<string, unknown>) => boolean,
): Promise<BloxsUitkomst<{ rijen: Record<string, unknown>[]; volgende: string | null }>> {
  await o.slaap(o.wacht);
  const r = await haalBloxsUrl(o.fetchFn, o.cfg, url, ACCEPT, v.entiteit, MAX_PAGINA_TEKENS);
  if (!r.ok) return r;
  const p = leesPagina(r.data, o.cfg.basis, v, voldoet);
  if (!p.ok) {
    console.warn(`[bloxs] ${v.entiteit}: ${p.fout}`);
    return { ok: false, fout: p.fout };
  }
  return { ok: true, data: { rijen: p.rijen, volgende: p.volgende } };
}

/**
 * Eerst testen of $select, $filter en $top werken, met $top=0 (geen rijen). Een 400 of 501 betekent
 * dat de feed dit niet ondersteunt: dan stoppen, en nooit hele tabellen ophalen.
 */
export async function testFuncties(o: Omgeving): Promise<Stap<true>> {
  const v = {
    entiteit: "owners",
    velden: ["OwnerId"],
    filter: [{ veld: "ArchiveDate", isLeeg: true }],
    top: 0,
  } satisfies Vraag<"owners">;
  await o.slaap(o.wacht);
  const r = await haalBloxsUrl(o.fetchFn, o.cfg, vraagUrl(o.cfg.basis, v), ACCEPT, "test", 100_000);
  if (!r.ok)
    return {
      ok: false,
      fout:
        r.fout === "onverwacht_antwoord" || r.fout === "niet_bereikbaar"
          ? "functie_niet_ondersteund"
          : r.fout,
      ...(r.status ? { status: r.status } : {}),
      aanvragen: 1,
    };
  const p = leesPagina(r.data, o.cfg.basis, v, () => true);
  // $top=0 moet nul rijen geven; anders werkt $top niet en vragen we niets meer op
  if (!p.ok || p.rijen.length) return { ok: false, fout: "functie_niet_ondersteund", aanvragen: 1 };
  return { ok: true, data: true, aanvragen: 1 };
}

const Tekst = (max: number) =>
  z
    .string()
    .nullable()
    .optional()
    .transform((t) => (t == null ? null : schoonNaam(t, max)));

export interface Eigenaar {
  id: BloxsId;
  referentie: string | null;
  naam: string;
}

const EigenaarRij = z.object({
  OwnerId: IdSchema,
  Reference: Tekst(100),
  DisplayName: Tekst(200),
});

/** Alle niet-gearchiveerde eigenaren: alleen id, referentie en naam */
export async function haalEigenaren(o: Omgeving, maxPaginas = 20): Promise<Stap<Eigenaar[]>> {
  const velden = ["OwnerId", "Reference", "DisplayName", "ArchiveDate"] as const;
  const uit: Eigenaar[] = [];
  let aanvragen = 0;
  let url: string | null = vraagUrl(o.cfg.basis, {
    entiteit: "owners",
    velden,
    filter: [{ veld: "ArchiveDate", isLeeg: true }],
    top: PAGINA,
  });
  let skip = 0;
  while (url && aanvragen < maxPaginas) {
    aanvragen++;
    const p: Awaited<ReturnType<typeof pagina>> = await pagina(
      o,
      url,
      { entiteit: "owners", velden },
      (r) => r["ArchiveDate"] == null,
    );
    if (!p.ok) return { ...p, aanvragen };
    for (const rij of p.data.rijen) {
      const e = EigenaarRij.safeParse(rij);
      if (!e.success) return { ok: false, fout: "onverwacht_antwoord", aanvragen };
      uit.push({
        id: e.data.OwnerId,
        referentie: e.data.Reference,
        naam: e.data.DisplayName ?? e.data.Reference ?? String(e.data.OwnerId),
      });
    }
    skip += p.data.rijen.length;
    url =
      p.data.volgende ??
      (p.data.rijen.length === PAGINA
        ? vraagUrl(o.cfg.basis, {
            entiteit: "owners",
            velden,
            filter: [{ veld: "ArchiveDate", isLeeg: true }],
            top: PAGINA,
            skip,
          })
        : null);
  }
  if (url) return { ok: false, fout: "onverwacht_antwoord", aanvragen };
  uit.sort((a, b) => a.naam.localeCompare(b.naam, "nl"));
  return { ok: true, data: uit, aanvragen };
}

export type Soort = "unit" | "building";

export interface BloxsObject {
  /** RealEstateObjectId, als tekst */
  ref: string;
  soort: Soort;
  referentie: string | null;
  /** Ids zoals de feed ze geeft (getal of tekst), nodig voor de juiste filterwaarde */
  complexId: BloxsId | null;
  complexNaam: string | null;
  adresId: BloxsId | null;
}

/** Waar de volgende pagina begint: eigen $skip, of de (gecontroleerde) link van de feed */
export type Cursor = { skip: number } | { link: string };

const ObjectRij = z.object({
  RealEstateObjectId: IdSchema,
  Reference: Tekst(100),
  ComplexId: IdSchema.nullable().optional(),
  ComplexName: Tekst(200),
  AddressId: IdSchema.nullable().optional(),
  SalesDate: z.string().max(40).nullable().optional(),
});

/**
 * Eén pagina units of buildings van een eigenaar (en eventueel één complex). Verkochte objecten
 * (verkoopdatum vandaag of eerder) worden overgeslagen. Geeft de cursor voor de volgende pagina.
 */
export async function haalObjectenPagina(
  o: Omgeving,
  w: { soort: Soort; eigenaar: BloxsId; complex?: BloxsId | null; cursor: Cursor },
): Promise<Stap<{ objecten: BloxsObject[]; volgende: Cursor | null }>> {
  const entiteit = w.soort === "unit" ? "Units" : "Buildings";
  const velden =
    w.soort === "unit"
      ? ([
          "RealEstateObjectId",
          "Reference",
          "OwnerId",
          "ComplexId",
          "ComplexName",
          "AddressId",
          "SalesDate",
        ] as const)
      : (["RealEstateObjectId", "Reference", "OwnerId", "AddressId", "SalesDate"] as const);
  const filter: Filter[] = [{ veld: "OwnerId", is: w.eigenaar }];
  if (w.complex != null && w.soort === "unit") filter.push({ veld: "ComplexId", is: w.complex });

  let url: string;
  if ("link" in w.cursor) {
    // de link komt via de browser terug: opnieuw controleren
    if (!volgendeLinkOk(o.cfg.basis, entiteit, w.cursor.link))
      return { ok: false, fout: "volgende_link_ongeldig", aanvragen: 0 };
    url = w.cursor.link;
  } else {
    url = vraagUrl(o.cfg.basis, { entiteit, velden, filter, top: PAGINA, skip: w.cursor.skip });
  }

  const p = await pagina(
    o,
    url,
    { entiteit, velden: velden as readonly string[] as typeof velden },
    (r) =>
      zelfdeId(r["OwnerId"], w.eigenaar) &&
      (w.complex == null || w.soort !== "unit" || zelfdeId(r["ComplexId"], w.complex)),
  );
  if (!p.ok) return { ...p, aanvragen: 1 };

  const nu = vandaag();
  const objecten: BloxsObject[] = [];
  for (const rij of p.data.rijen) {
    const r = ObjectRij.safeParse(rij);
    if (!r.success) return { ok: false, fout: "onverwacht_antwoord", aanvragen: 1 };
    const verkocht = r.data.SalesDate && r.data.SalesDate.slice(0, 10) <= nu;
    if (verkocht) continue;
    objecten.push({
      ref: String(r.data.RealEstateObjectId),
      soort: w.soort,
      referentie: r.data.Reference,
      complexId: r.data.ComplexId ?? null,
      complexNaam: r.data.ComplexName,
      adresId: r.data.AddressId ?? null,
    });
  }
  const skip = "skip" in w.cursor ? w.cursor.skip : 0;
  const volgende: Cursor | null = p.data.volgende
    ? { link: p.data.volgende }
    : "skip" in w.cursor && p.data.rijen.length === PAGINA
      ? { skip: skip + PAGINA }
      : null;
  return { ok: true, data: { objecten, volgende }, aanvragen: 1 };
}

export type BloxsAdres =
  ({ adresId: string; ok: true } & PortefeuilleAdres) | { adresId: string; ok: false; ruw: string };

const AdresRij = z.object({
  AddressId: IdSchema,
  PostalCode: z.string().max(20).nullable().optional(),
  HouseNumber: z
    .union([z.string().max(40), z.number()])
    .nullable()
    .optional(),
  Street: Tekst(200),
  City: Tekst(100),
});

/**
 * Adressen bij de AddressId's van onze eigen objecten (nooit de hele tabel: daarin staan ook
 * adressen van personen). Het huisnummer wordt gesplitst in nummer, letter en toevoeging; lukt
 * dat niet, dan komt het adres terug als "ruw" (postcode + huisnummer) om te controleren.
 */
export async function haalAdressen(
  o: Omgeving,
  ids: readonly BloxsId[],
): Promise<Stap<BloxsAdres[]>> {
  if (!ids.length || ids.length > MAX_ADRESSEN)
    return { ok: false, fout: "onverwacht_antwoord", aanvragen: 0 };
  const velden = ["AddressId", "PostalCode", "HouseNumber", "Street", "City"] as const;
  const gevraagd = new Set(ids.map(String));
  const url = vraagUrl(o.cfg.basis, {
    entiteit: "Addresses",
    velden,
    filter: [{ veld: "AddressId", eenVan: ids }],
    top: ids.length,
  });
  const p = await pagina(o, url, { entiteit: "Addresses", velden }, (r) =>
    gevraagd.has(String(r["AddressId"])),
  );
  if (!p.ok) return { ...p, aanvragen: 1 };
  const uit: BloxsAdres[] = [];
  for (const rij of p.data.rijen) {
    const r = AdresRij.safeParse(rij);
    if (!r.success) return { ok: false, fout: "onverwacht_antwoord", aanvragen: 1 };
    const adresId = String(r.data.AddressId);
    const a = normaliseerAdres({ postcode: r.data.PostalCode, huisnummer: r.data.HouseNumber });
    if (a.ok) {
      uit.push({
        adresId,
        ok: true,
        ...a.adres,
        straat: r.data.Street,
        woonplaats: r.data.City,
      });
    } else {
      const ruw = [r.data.PostalCode ?? "", r.data.HouseNumber ?? ""].join(" ").trim();
      uit.push({ adresId, ok: false, ruw: schoonNaam(ruw, 60) ?? "(leeg)" });
    }
  }
  return { ok: true, data: uit, aanvragen: 1 };
}

/**
 * Diagnose voor beheerders: per entiteit uit de allowlist één vraag met $top=0 (geen rijen), om te
 * zien of het account er toegang toe heeft. Geeft alleen ok of de foutcode met de HTTP-status.
 */
export interface ToegangRegel {
  entiteit: string;
  ok: boolean;
  fout?: BloxsFout;
  status?: number;
  methoden?: string[];
}

export async function testToegang(o: Omgeving): Promise<ToegangRegel[]> {
  const uit: ToegangRegel[] = [];
  // is $metadata ook zonder inloggegevens op te vragen? (dan zegt een geslaagde verbindingstest
  // niets over gebruiker en wachtwoord)
  await o.slaap(o.wacht);
  const open = await haalBloxsUrl(
    o.fetchFn,
    o.cfg,
    o.cfg.basis + "/$metadata",
    "application/xml",
    "metadata zonder inlog",
    MAX_PAGINA_TEKENS,
    true,
  );
  uit.push(
    open.ok
      ? { entiteit: "$metadata zonder inloggegevens", ok: true }
      : {
          entiteit: "$metadata zonder inloggegevens",
          ok: false,
          fout: open.fout,
          ...(open.status ? { status: open.status } : {}),
          ...(open.methoden ? { methoden: open.methoden } : {}),
        },
  );
  for (const entiteit of Object.keys(ALLOWLIST) as Entiteit[]) {
    await o.slaap(o.wacht);
    const url = vraagUrl(o.cfg.basis, {
      entiteit,
      velden: [ALLOWLIST[entiteit][0]] as never,
      top: 0,
    });
    const r = await haalBloxsUrl(o.fetchFn, o.cfg, url, ACCEPT, "toegang " + entiteit, 100_000);
    if (!r.ok) {
      uit.push({
        entiteit,
        ok: false,
        fout: r.fout,
        ...(r.status ? { status: r.status } : {}),
        ...(r.methoden ? { methoden: r.methoden } : {}),
      });
      continue;
    }
    const p = leesPagina(
      r.data,
      o.cfg.basis,
      { entiteit, velden: [ALLOWLIST[entiteit][0]] as never },
      () => true,
    );
    uit.push(
      p.ok && !p.rijen.length
        ? { entiteit, ok: true }
        : { entiteit, ok: false, fout: "functie_niet_ondersteund" },
    );
  }
  return uit;
}
