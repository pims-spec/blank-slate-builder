// OData-aanvragen aan de Bloxs-feed, als pure functies. De inlog van de feed ziet ALLES (ook
// personen, contracten en financiën); daarom kan deze code alleen de entiteiten en velden uit de
// allowlist opvragen, alleen met filters die we zelf opbouwen, en controleert ze elk antwoord:
// - er mogen geen andere velden in staan dan gevraagd ($select genegeerd → stoppen);
// - elke rij moet aan het filter voldoen ($filter genegeerd → stoppen);
// - een volgende-pagina-link moet naar exact onze eigen feed wijzen.
import * as z from "zod";

/** Entiteiten en velden die de app mag opvragen; al het andere weigert de server */
export const ALLOWLIST = {
  owners: ["OwnerId", "Reference", "DisplayName", "ArchiveDate"],
  Units: [
    "RealEstateObjectId",
    "Reference",
    "OwnerId",
    "ComplexId",
    "ComplexName",
    "AddressId",
    "SalesDate",
    "CategoryName",
  ],
  Buildings: [
    "RealEstateObjectId",
    "Reference",
    "OwnerId",
    "AddressId",
    "SalesDate",
    "CategoryName",
  ],
  Addresses: ["AddressId", "PostalCode", "HouseNumber", "Street", "City"],
} as const;

export type Entiteit = keyof typeof ALLOWLIST;
type Veld<E extends Entiteit> = (typeof ALLOWLIST)[E][number];

/** Een id uit de feed: geheel getal, GUID of korte code */
export const IdSchema = z.union([
  z.number().int().safe(),
  z.string().regex(/^[A-Za-z0-9_-]{1,64}$/),
]);
export type BloxsId = z.infer<typeof IdSchema>;

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** OData v4-literal voor een id: getal en GUID kaal, overige tekst tussen enkele aanhalingstekens */
export function literal(v: BloxsId): string {
  const id = IdSchema.parse(v);
  if (typeof id === "number") return String(id);
  if (GUID.test(id)) return id;
  return "'" + id + "'";
}

/** Filters die de app kan maken (geen vrije tekst) */
export type Filter =
  | { veld: string; is: BloxsId }
  | { veld: string; isLeeg: true }
  | { veld: string; eenVan: readonly BloxsId[] };

function filterTekst<E extends Entiteit>(e: E, f: readonly Filter[]): string {
  const velden = ALLOWLIST[e] as readonly string[];
  return f
    .map((x) => {
      if (!velden.includes(x.veld)) throw new Error("veld_niet_toegestaan");
      if ("isLeeg" in x) return x.veld + " eq null";
      if ("is" in x) return x.veld + " eq " + literal(x.is);
      if (!x.eenVan.length || x.eenVan.length > 50) throw new Error("filter_ongeldig");
      return "(" + x.eenVan.map((v) => x.veld + " eq " + literal(v)).join(" or ") + ")";
    })
    .join(" and ");
}

export interface Vraag<E extends Entiteit> {
  entiteit: E;
  velden: readonly Veld<E>[];
  filter?: readonly Filter[];
  top: number;
  skip?: number;
}

/** De URL voor een vraag; gooit bij een entiteit of veld buiten de allowlist */
export function vraagUrl<E extends Entiteit>(basis: string, v: Vraag<E>): string {
  if (!Object.hasOwn(ALLOWLIST, v.entiteit)) throw new Error("entiteit_niet_toegestaan");
  const toegestaan = ALLOWLIST[v.entiteit] as readonly string[];
  if (!v.velden.length || v.velden.some((x) => !toegestaan.includes(x)))
    throw new Error("veld_niet_toegestaan");
  if (!Number.isInteger(v.top) || v.top < 0 || v.top > 1000) throw new Error("top_ongeldig");
  const q = new URLSearchParams();
  q.set("$select", v.velden.join(","));
  if (v.filter?.length) q.set("$filter", filterTekst(v.entiteit, v.filter));
  q.set("$top", String(v.top));
  if (v.skip) q.set("$skip", String(v.skip));
  return basis + "/" + v.entiteit + "?" + q.toString().replace(/\+/g, "%20");
}

/**
 * Mag deze volgende-pagina-link gevolgd worden? Alleen als hij naar dezelfde host en dezelfde
 * entiteit binnen onze feed wijst, zonder inloggegevens in de URL.
 */
export function volgendeLinkOk(basis: string, entiteit: Entiteit, link: string): boolean {
  let u: URL, b: URL;
  try {
    u = new URL(link, basis + "/");
    b = new URL(basis);
  } catch {
    return false;
  }
  return (
    u.protocol === "https:" &&
    u.origin === b.origin &&
    !u.username &&
    !u.password &&
    u.pathname === b.pathname.replace(/\/+$/, "") + "/" + entiteit
  );
}

const PaginaSchema = z.object({
  value: z.array(z.record(z.string(), z.unknown())).max(1000),
  "@odata.nextLink": z.string().max(4000).optional(),
});

export type PaginaFout =
  "onverwacht_antwoord" | "select_genegeerd" | "filter_genegeerd" | "volgende_link_ongeldig";

/**
 * Een pagina uit de feed controleren: alleen gevraagde velden (plus @odata-annotaties), elke rij
 * voldoet aan `voldoet`, en een eventuele volgende link wijst naar onze eigen feed.
 * De rijen komen terug met alleen de gevraagde velden.
 */
export function leesPagina<E extends Entiteit>(
  tekst: string,
  basis: string,
  v: Pick<Vraag<E>, "entiteit" | "velden">,
  voldoet: (rij: Record<string, unknown>) => boolean,
):
  | { ok: true; rijen: Record<string, unknown>[]; volgende: string | null }
  | { ok: false; fout: PaginaFout } {
  let json: unknown;
  try {
    json = JSON.parse(tekst);
  } catch {
    return { ok: false, fout: "onverwacht_antwoord" };
  }
  const p = PaginaSchema.safeParse(json);
  if (!p.success) return { ok: false, fout: "onverwacht_antwoord" };
  const gevraagd = new Set<string>(v.velden);
  const rijen: Record<string, unknown>[] = [];
  for (const rij of p.data.value) {
    for (const k of Object.keys(rij))
      if (!gevraagd.has(k) && !k.startsWith("@odata."))
        return { ok: false, fout: "select_genegeerd" };
    if (!voldoet(rij)) return { ok: false, fout: "filter_genegeerd" };
    rijen.push(Object.fromEntries([...gevraagd].map((k) => [k, rij[k] ?? null])));
  }
  const link = p.data["@odata.nextLink"];
  if (link && !volgendeLinkOk(basis, v.entiteit, link))
    return { ok: false, fout: "volgende_link_ongeldig" };
  return { ok: true, rijen, volgende: link ? new URL(link, basis + "/").toString() : null };
}

/** Is dit een id-waarde gelijk aan `id` (de feed kan getallen als tekst geven) */
export const zelfdeId = (a: unknown, b: BloxsId) =>
  (typeof a === "number" || typeof a === "string") && String(a) === String(b);
