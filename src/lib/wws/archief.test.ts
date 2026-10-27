import { describe, expect, it } from "vitest";
import {
  LEGE_FILTERS,
  archiefRij,
  collegasInLijst,
  groepeerPerCollega,
  heeftFilters,
  matchFilters,
  matchZoek,
  type ArchiefFilters,
  versieKeuzes,
  versiesTekst,
} from "./archief";
import { calc } from "./calc";
import { DEFAULT_NORMEN, type Normen } from "./normen";
import { maakTellingDoc, nieuweTellingStaat } from "./opslag/doc";
import type { Telling } from "./opslag/types";

const N = DEFAULT_NORMEN as unknown as Normen;
const KLANTEN = [
  { id: "k1", naam: "Amstel Wonen", pves: [] },
  { id: "k2", naam: "Zeta Vastgoed", pves: [] },
];

function telling(
  id: string,
  ownerId: string,
  ownerNaam: string,
  extra: { klantId?: string; peildatum?: string; m2?: number; eengezins?: boolean } = {},
): Telling {
  const s = nieuweTellingStaat("x");
  s.meta = {
    ...s.meta,
    naam: "Telling " + id,
    adres: "Straat",
    huisnummer: id,
    postcode: "1051 AB",
    klantId: extra.klantId ?? "",
    peildatum: extra.peildatum ?? "2026-10-01",
  };
  s.input.vertrekken.push({ type: "woonkamer", m2: extra.m2 ?? 30, verwarmd: true });
  if (extra.eengezins) s.input.woningtype = "eengezins";
  return {
    ...maakTellingDoc(s, N, null),
    id,
    ownerId,
    ownerNaam,
    gewijzigdOp: "2026-10-14T10:00:00Z",
  };
}

const T = [
  telling("1", "u-pim", "Pim", { klantId: "k1", peildatum: "2026-01-10" }),
  telling("2", "u-anna", "Anna", { klantId: "k2", m2: 120, eengezins: true }),
  telling("3", "u-pim", "Pim", { klantId: "verwijderd" }),
];
const R = T.map((t) => archiefRij(t, N, KLANTEN));
const met = (f: Partial<ArchiefFilters>) =>
  R.filter((r) => matchFilters(r, { ...LEGE_FILTERS, ...f })).map((r) => r.t.id);

describe("archief", () => {
  it("rij: live punten en segment, eigenaar en collega", () => {
    expect(R[0]!.punten).toBe(calc(T[0]!.input, N).totaal);
    expect(R[0]!.seg).toBe(calc(T[0]!.input, N).seg);
    expect(R[0]!.eigenaar).toBe("Amstel Wonen");
    expect(R[0]!.collega).toBe("Pim");
    // verwijderde eigenaar: geen eigenaar (zoals in de oude tool)
    expect(R[2]!.eigenaar).toBe("");
  });

  it("zoeken op naam, adres, postcode, eigenaar en collega", () => {
    const zoek = (q: string) => R.filter((r) => matchZoek(r, q)).map((r) => r.t.id);
    expect(zoek("")).toEqual(["1", "2", "3"]);
    expect(zoek("zeta")).toEqual(["2"]);
    expect(zoek("anna")).toEqual(["2"]);
    expect(zoek("straat 3")).toEqual(["3"]);
    expect(zoek("1051")).toEqual(["1", "2", "3"]);
  });

  it("filters: eigenaar, collega, peildatum, woningtype, segment en punten", () => {
    expect(met({ eigenaar: "k1" })).toEqual(["1"]);
    expect(met({ collega: "u-pim" })).toEqual(["1", "3"]);
    expect(met({ peilVan: "2026-02-01" })).toEqual(["2", "3"]);
    expect(met({ peilTot: "2026-01-31" })).toEqual(["1"]);
    expect(met({ woningtype: "eengezins" })).toEqual(["2"]);
    const p2 = R[1]!.punten!;
    expect(met({ puntenVan: String(p2) })).toEqual(["2"]);
    expect(met({ puntenTot: String(p2 - 1) })).toEqual(["1", "3"]);
    expect(met({ segment: R[1]!.seg! })).toContain("2");
    expect(heeftFilters(LEGE_FILTERS)).toBe(false);
    expect(heeftFilters({ ...LEGE_FILTERS, segment: "hoog" })).toBe(true);
  });

  it("groeperen per collega, op naam", () => {
    const g = groepeerPerCollega(R);
    expect(g.map((x) => [x.naam, x.rijen.map((r) => r.t.id)])).toEqual([
      ["Anna", ["2"]],
      ["Pim", ["1", "3"]],
    ]);
    expect(collegasInLijst(R)).toEqual([
      { id: "u-anna", naam: "Anna" },
      { id: "u-pim", naam: "Pim" },
    ]);
  });
});

describe("sorteerFavNaam (zoals de bron)", () => {
  it("favorieten eerst, dan op naam (nl, hoofdletterongevoelig)", async () => {
    const { sorteerFavNaam } = await import("./archief");
    const r = (titel: string, favoriet = false) =>
      ({ titel, t: { meta: { favoriet } } }) as never as {
        titel: string;
        t: { meta: Record<string, unknown> };
      };
    const uit = sorteerFavNaam([
      r("bakker"),
      r("Zeeweg", true),
      r("Appel"),
      r("aardbei", true),
    ] as never[]);
    expect((uit as { titel: string }[]).map((x) => x.titel)).toEqual([
      "aardbei",
      "Zeeweg",
      "Appel",
      "bakker",
    ]);
  });
});

describe("sorteerFavGewijzigd (standaard in het archief)", () => {
  it("favorieten eerst, dan laatst gewijzigd bovenaan, bij gelijke datum op naam", async () => {
    const { sorteerFavGewijzigd } = await import("./archief");
    const r = (titel: string, gewijzigdOp: string, favoriet = false) =>
      ({ titel, t: { gewijzigdOp, meta: { favoriet } } }) as never;
    const uit = sorteerFavGewijzigd([
      r("oud", "2026-01-01T10:00:00Z"),
      r("fav oud", "2025-06-01T10:00:00Z", true),
      r("nieuw", "2026-10-27T09:00:00Z"),
      r("fav nieuw", "2026-10-01T10:00:00Z", true),
      r("Bakker", "2026-01-01T10:00:00Z"),
    ]);
    expect((uit as { titel: string }[]).map((x) => x.titel)).toEqual([
      "fav nieuw",
      "fav oud",
      "nieuw",
      "Bakker",
      "oud",
    ]);
  });
});

describe("versies in het archief", () => {
  it("aantal zoals archiefRow() in de bron", () => {
    expect(versiesTekst({ aantalVersies: 0, versieCount: 0 })).toBe("geen versies");
    expect(versiesTekst({ aantalVersies: 1, versieCount: 1 })).toBe("1 versie");
    expect(versiesTekst({ aantalVersies: 3, versieCount: 4 })).toBe("3 versies");
  });

  it("keuzelijst: werkversie, dan de versies van nieuw naar oud, alleen van deze telling", () => {
    const keuzes = versieKeuzes("a", [
      { tellingId: "a", nr: 1, notitie: "Begin", createdAt: "2026-03-04T10:00:00Z" },
      { tellingId: "b", nr: 1, notitie: "Ander", createdAt: "2026-03-04T10:00:00Z" },
      { tellingId: "a", nr: 2, notitie: "Na renovatie", createdAt: "2026-05-01T10:00:00Z" },
    ]);
    expect(keuzes).toEqual([
      { waarde: "", label: "Werkversie" },
      { waarde: "2", label: "v2 — Na renovatie" },
      { waarde: "1", label: "v1 — Begin" },
    ]);
  });
});
