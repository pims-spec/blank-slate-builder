// De opties van de app in het indelingsadvies (bewuste afwijkingen van wws-site.html): één toilet
// in een woning met één woonlaag, de raamregel, de hal bij de woonkamer, een open keuken en de
// voorzieningen die in de woning komen.
import { describe, expect, it } from "vitest";
import { facDefault } from "./basis";
import { calc } from "./calc";
import {
  berekenVarianten,
  bouwVariant,
  eenToilet,
  keukenOpenSamenvoegen,
  keukenOpenStandaard,
  logischToilet,
  meerWoonlagen,
  ruimtenUitTelling,
  halKanWeg,
  ruimtenVoorAdvies,
  ruimteWijzigen,
  standaardVoorzieningen,
  toepassen,
  voorzieningenToepassen,
  type IndelingRij,
  type IndelingVariant,
  type Voorzieningen,
} from "./indeling";
import { legeInput } from "./legeInput";
import { DEFAULT_NORMEN, type Normen } from "./normen";
import type { Pve } from "./pve";
import type { FacBadkamer, FacKeuken, FacToilet, WwsInput } from "./types";

const N = DEFAULT_NORMEN as unknown as Normen;

/**
 * Da Costastraat 49 II, Amsterdam (Pims voorbeeld): appartement op één verdieping. Slaapkamer aan
 * het balkon, badkamer, washok, hal, keuken open aan de woonkamer, een toiletruimte van 2 m² bij
 * de trap en een klein toilet bij de hal. Alles zoals ingelezen: voorzieningen leeg.
 */
function daCosta(): WwsInput {
  const x = legeInput();
  x.woningtype = "meergezins";
  x.vertrekken.push(
    { type: "slaapkamer", naam: "Slaapkamer", m2: "11,34", verwarmd: true, raam: true },
    {
      type: "badkamer",
      naam: "Badkamer",
      m2: "4,32",
      verwarmd: true,
      raam: false,
      fac: facDefault("badkamer", true),
    },
    {
      type: "keuken",
      naam: "Keuken",
      m2: "4,9",
      verwarmd: true,
      raam: true,
      openKeuken: true,
      fac: { kind: "keuken", keuken: { lengte: ">=2", voorz: {} } },
    },
    { type: "woonkamer", naam: "Woonkamer", m2: "15,31", verwarmd: true, raam: true },
  );
  x.overig.push(
    {
      type: "wasruimte",
      naam: "Wasruimte / bijkeuken",
      m2: 3,
      verwarmd: true,
      raam: false,
      fac: facDefault("was", true),
    },
    { type: "hal", naam: "Hal", m2: "5,5", verwarmd: true, raam: false },
    {
      type: "toilet",
      naam: "Toiletruimte",
      m2: 2,
      verwarmd: true,
      raam: false,
      fac: facDefault("toilet", true),
    },
    {
      type: "toilet",
      naam: "Toilet",
      m2: "1,1",
      verwarmd: true,
      raam: false,
      fac: facDefault("toilet", true),
    },
  );
  x.energie = { soort: "label", label: "C", indexKlasse: "", datum: "2024-01-01", bouwjaar: "" };
  return x;
}

const alle = (v: Pick<IndelingVariant, "vertrekken" | "overig">) => [...v.vertrekken, ...v.overig];
const toiletruimten = (v: Pick<IndelingVariant, "overig">) =>
  v.overig.filter((r) => r.type === "toilet" && Number(String(r.m2).replace(",", ".")) > 0);
const badkamerToilet = (v: Pick<IndelingVariant, "vertrekken">) => {
  const b = v.vertrekken.find((r) => r.fac?.kind === "badkamer")!.fac as FacBadkamer;
  return Number(b.san.toiletStaand) + Number(b.san.toiletHang);
};

describe("woonlagen en één toilet", () => {
  it("meerWoonlagen: eengezinswoning, of een overloop/zolderkamer/zolder", () => {
    const x = daCosta();
    expect(meerWoonlagen(x)).toBe(false);
    expect(meerWoonlagen({ ...x, woningtype: "eengezins" })).toBe(true);
    const y = daCosta();
    y.overig.push({ type: "overloop", m2: 3, verwarmd: true });
    expect(meerWoonlagen(y)).toBe(true);
  });

  it("één woonlaag: van twee toiletruimten blijft er één vast, de andere wordt vrij", () => {
    const rooms = ruimtenVoorAdvies(daCosta());
    const t = rooms.filter((r) => r.kind === "toilet");
    // geen hal getekend: het kleinste toilet van minstens 0,9 m² blijft
    expect(t.map((r) => [r.naam, r.status])).toEqual([
      ["Toiletruimte", "vrij"],
      ["Toilet", "vast"],
    ]);
    // de bron (ruimtenUitTelling) houdt ze allebei vast
    expect(
      ruimtenUitTelling(daCosta())
        .filter((r) => r.kind === "toilet")
        .map((r) => r.status),
    ).toEqual(["vast", "vast"]);
  });

  it("meer woonlagen: alle toiletruimten blijven vast", () => {
    const x = { ...daCosta(), woningtype: "eengezins" as const };
    expect(
      ruimtenVoorAdvies(x)
        .filter((r) => r.kind === "toilet")
        .map((r) => r.status),
    ).toEqual(["vast", "vast"]);
  });

  it("logischToilet: met een getekende hal het toilet dat er het dichtst bij ligt", () => {
    const rooms = ruimtenUitTelling(daCosta());
    const hal = rooms.find((r) => r.type === "hal")!;
    hal.bbox = { x: 0.4, y: 0.4, w: 0.1, h: 0.2 };
    const [groot, klein] = rooms.filter((r) => r.kind === "toilet");
    groot!.bbox = { x: 0.45, y: 0.65, w: 0.1, h: 0.1 };
    klein!.bbox = { x: 0.1, y: 0.9, w: 0.05, h: 0.05 };
    expect(logischToilet([groot!, klein!], rooms)).toBe(groot);
    // zonder bbox's: kleinste ≥ 0,9 m², anders het grootste
    const zonder = ruimtenUitTelling(daCosta()).filter((r) => r.kind === "toilet");
    expect(logischToilet(zonder, [])!.m2).toBe(1.1);
    expect(
      logischToilet(
        zonder.map((r, i) => ({ ...r, m2: i ? 0.5 : 0.8 })),
        [],
      )!.m2,
    ).toBe(0.8);
  });

  it("eenToilet: is er een toiletruimte met toilet, dan geen toilet in de badkamer", () => {
    const san = { ...(facDefault("badkamer") as FacBadkamer).san, toiletStaand: 1 };
    const v = {
      vertrekken: [
        { type: "badkamer", m2: 5, verwarmd: true, fac: { kind: "badkamer", san } },
      ] as IndelingRij[],
      overig: [
        { type: "toilet", m2: 1, verwarmd: true, fac: facDefault("toilet") },
      ] as IndelingRij[],
    };
    expect(badkamerToilet(eenToilet(v))).toBe(0);
    expect(badkamerToilet(v)).toBe(1); // ongewijzigd
    // toiletruimte zonder toilet: badkamer houdt het toilet
    const zonder = { ...v, overig: [{ ...v.overig[0]!, fac: facDefault("toilet", true) }] };
    expect(eenToilet(zonder)).toBe(zonder);
  });

  it("een nieuw voorgestelde toiletruimte is 1,1 m² (de bron: 2 m²)", () => {
    const x = legeInput();
    x.vertrekken.push(
      { type: "woonkamer", m2: 40, verwarmd: true },
      { type: "slaapkamer", m2: 20, verwarmd: true },
    );
    const rooms = ruimtenUitTelling(x);
    const pve = { id: "p", naam: "T", indeling: { apartToilet: "ja" } } as Pve;
    const toilet = (o?: object) =>
      bouwVariant(1, pve, rooms, x, o)!.overig.find((r) => r.type === "toilet")!.m2;
    expect(toilet()).toBe("2");
    expect(toilet({})).toBe("1,1");
  });
});

describe("raamregel: een woon- of slaapkamer heeft een raam", () => {
  it("niet meer woon- en slaapkamers dan vrije ruimten met raam", () => {
    const x = daCosta();
    const v = berekenVarianten(x, ruimtenVoorAdvies(x), null, "", N, {});
    // vrij met raam: slaapkamer en woonkamer → woonkamer + 1 slaapkamer
    expect(v.map((x) => x.nSlaap)).toEqual([1]);
    // zonder raam in de slaapkamer: geen enkele variant met een nieuwe woonkamer en slaapkamer
    const y = daCosta();
    y.vertrekken[0]!.raam = false;
    expect(berekenVarianten(y, ruimtenVoorAdvies(y), null, "", N, {})).toEqual([]);
  });

  it("raam aanvinken in stap Ruimten: in de ruimtelijst én in de telling", () => {
    const x = daCosta();
    const rooms = ruimtenVoorAdvies(x);
    const i = rooms.findIndex((r) => r.type === "wasruimte");
    const uit = ruimteWijzigen(x, rooms, i, { raam: true });
    expect(uit.rooms[i]!.raam).toBe(true);
    expect(uit.input.overig[0]!.raam).toBe(true);
    expect(x.overig[0]!.raam).toBe(false); // origineel ongewijzigd
  });

  it("onbekend raam: een vertrek wel, een overige ruimte niet", () => {
    const x = daCosta();
    x.vertrekken.forEach((r) => delete r.raam);
    x.overig.forEach((r) => delete r.raam);
    const rooms = ruimtenVoorAdvies(x);
    expect(rooms.find((r) => r.type === "badkamer")!.raam).toBe(true);
    expect(rooms.find((r) => r.type === "hal")!.raam).toBe(false);
    // een grote berging zonder raam levert geen extra slaapkamer op
    x.overig.push({ type: "berging_in", m2: 12, verwarmd: false });
    const v = berekenVarianten(x, ruimtenVoorAdvies(x), null, "3", N, {});
    expect(v.every((x) => x.nSlaap <= 1)).toBe(true);
  });
});

describe("hal bij de woonkamer of keuken", () => {
  it("Da Costastraat: hal tot 2 m², de rest bij de woonkamer; levert punten op", () => {
    const x = daCosta();
    const rooms = ruimtenVoorAdvies(x);
    const zonder = berekenVarianten(x, rooms, null, "", N, {})[0]!;
    const met = berekenVarianten(x, rooms, null, "", N, { hal: "klein" })[0]!;
    const hal = (v: IndelingVariant) => v.overig.find((r) => r.type === "hal")!.m2;
    expect(hal(zonder)).toBe("2"); // 30% van 5,5 is minder dan 2
    expect(hal(met)).toBe("2");
    // zonder de optie gaat 3,5 m² naar de pot (woonkamer en slaapkamer samen), met de optie
    // alleen naar de woonkamer
    const woon = (v: IndelingVariant) =>
      Number(String(v.vertrekken.find((r) => r.type === "woonkamer")!.m2).replace(",", "."));
    expect(woon(met)).toBeGreaterThan(woon(zonder));
    expect(met.halWinst).toBe(met.R.totaal - zonder.R.totaal);
  });

  it("vaste woonkamer: de m² uit de hal komen erbij; ook een variant zonder nieuwe slaapkamer", () => {
    const x = legeInput();
    x.vertrekken.push(
      { type: "woonkamer", naam: "Woonkamer", m2: 25, verwarmd: true, maten: [{ l: 5, b: 5 }] },
      { type: "slaapkamer", m2: 12, verwarmd: true },
      { type: "keuken", m2: 6, verwarmd: true, fac: facDefault("keuken") },
      { type: "badkamer", m2: 4, verwarmd: true, fac: facDefault("badkamer") },
    );
    x.overig.push(
      { type: "hal", m2: 12, verwarmd: true },
      { type: "toilet", m2: 1, verwarmd: true, fac: facDefault("toilet") },
    );
    x.energie = { soort: "label", label: "C", indexKlasse: "", datum: "2024-01-01", bouwjaar: "" };
    const rooms = ruimtenVoorAdvies(x).map((r) =>
      r.type === "hal" ? r : { ...r, status: "vast" as const },
    );
    // geen ruimte met raam voor een nieuwe slaapkamer: alleen de variant met 0 nieuwe
    expect(berekenVarianten(x, rooms, null, "", N, {})).toHaveLength(1);
    const [v] = berekenVarianten(x, rooms, null, "", N, { hal: "klein" });
    expect(v!.nSlaap).toBe(0);
    expect(v!.slaapTotaal).toBe(1);
    const woon = v!.vertrekken.find((r) => r.type === "woonkamer")!;
    expect(woon).toMatchObject({ m2: "35", maten: [], _indVast: true, _indErbij: 10 });
    expect(v!.overig.find((r) => r.type === "hal")!.m2).toBe("2");
    expect(v!.halWinst).toBeGreaterThan(0);
    // toepassen haalt de markering weg
    expect(JSON.stringify(toepassen(x, v!))).not.toContain("_indErbij");
  });
});

describe("hal opheffen", () => {
  it("één woonlaag: de hal gaat helemaal naar de woonkamer", () => {
    const x = daCosta();
    expect(halKanWeg(x)).toBe(true);
    const rooms = ruimtenVoorAdvies(x);
    const klein = berekenVarianten(x, rooms, null, "", N, { hal: "klein" })[0]!;
    const weg = berekenVarianten(x, rooms, null, "", N, { hal: "weg" })[0]!;
    expect(weg.overig.some((r) => r.type === "hal")).toBe(false);
    const woon = (v: IndelingVariant) =>
      Number(String(v.vertrekken.find((r) => r.type === "woonkamer")!.m2).replace(",", "."));
    expect(woon(weg)).toBeCloseTo(woon(klein) + 2, 2);
    expect(weg.halWinst!).toBeGreaterThanOrEqual(klein.halWinst!);
  });

  it("meer woonlagen: de hal blijft 2 m² (trap); een overloop blijft altijd 2 m²", () => {
    const x = daCosta();
    x.overig.push({ type: "overloop", m2: 4, verwarmd: true });
    expect(halKanWeg(x)).toBe(false);
    const [v] = berekenVarianten(x, ruimtenVoorAdvies(x), null, "", N, { hal: "weg" });
    expect(
      v!.overig.filter((r) => r.type === "hal" || r.type === "overloop").map((r) => r.m2),
    ).toEqual(["2", "2"]);
  });
});

describe("open keuken", () => {
  it("keuken die open aan de woonkamer zit: één woonkamer met open keuken", () => {
    const x = daCosta();
    expect(keukenOpenStandaard(x)).toBe(true);
    const rooms = ruimtenVoorAdvies(x);
    const zonder = berekenVarianten(x, rooms, null, "", N, {})[0]!;
    expect(zonder.vertrekken.some((r) => r.type === "keuken")).toBe(true);
    const met = berekenVarianten(x, rooms, null, "", N, { keukenOpen: true })[0]!;
    expect(met.vertrekken.some((r) => r.type === "keuken" || r.type === "woonkamer")).toBe(false);
    const ok = met.vertrekken.filter((r) => r.type === "woonkamer_ok");
    expect(ok).toHaveLength(1);
    expect(ok[0]).toMatchObject({ naam: "Woonkamer met open keuken", _indNieuw: true });
    expect((ok[0]!.fac as FacKeuken).keuken.lengte).toBe(">=2");
    // dezelfde m² als keuken + woonkamer samen
    const m2 = (rs: IndelingRij[]) =>
      rs.reduce((s, r) => s + Number(String(r.m2).replace(",", ".")), 0);
    expect(m2(met.vertrekken)).toBeCloseTo(m2(zonder.vertrekken), 2);
    expect(met.R).toEqual(calc(met.input, N));
  });

  it("keukenOpenSamenvoegen: twee vaste ruimten blijven vast; zonder woonkamer niets", () => {
    const v = {
      vertrekken: [
        { type: "woonkamer", m2: 20, verwarmd: true, _indVast: true },
        { type: "slaapkamer", m2: 10, verwarmd: true },
        { type: "keuken", m2: "5,5", verwarmd: true, fac: facDefault("keuken"), _indVast: true },
      ] as IndelingRij[],
      overig: [] as IndelingRij[],
    };
    const uit = keukenOpenSamenvoegen(v);
    expect(uit.vertrekken.map((r) => r.type)).toEqual(["woonkamer_ok", "slaapkamer"]);
    expect(uit.vertrekken[0]).toMatchObject({ m2: "25,5", _indVast: true });
    expect(v.vertrekken).toHaveLength(3); // ongewijzigd
    const geen = { ...v, vertrekken: v.vertrekken.slice(1) };
    expect(keukenOpenSamenvoegen(geen)).toBe(geen);
  });
});

describe("voorzieningen die in de woning komen", () => {
  const vz: Voorzieningen = {
    keuken: { lengte: ">=2", voorz: { inductie: true } as never },
    san: {
      ...(facDefault("badkamer") as FacBadkamer).san,
      bad: 1,
      wastafel: 2,
    },
    toilet: { toilet: "hangend", fontein: true },
  };

  it("standaard: PvE, anders wat in de telling staat, anders de standaard", () => {
    const x = daCosta();
    const s = standaardVoorzieningen(x, null);
    expect(s.keuken.lengte).toBe(">=2"); // ingelezen aanrecht
    expect(s.san).toEqual((facDefault("badkamer") as FacBadkamer).san); // badkamer was leeg
    expect(s.toilet).toEqual({ toilet: "staand", fontein: false });
    const pve = {
      id: "p",
      naam: "T",
      toilet: { actief: true, toilet: { toilet: "hangend", fontein: true } },
    } as Pve;
    expect(standaardVoorzieningen(x, pve).toilet).toEqual({ toilet: "hangend", fontein: true });
    expect(standaardVoorzieningen(x, pve).keuken.lengte).toBe(">=2");
  });

  it("elke keuken, badkamer en toiletruimte krijgt ze; één toilet blijft één toilet", () => {
    const x = daCosta();
    const rooms = ruimtenVoorAdvies(x);
    const [v] = berekenVarianten(x, rooms, null, "", N, { voorzieningen: vz, keukenOpen: true });
    expect(toiletruimten(v!)).toHaveLength(1);
    expect((toiletruimten(v!)[0]!.fac as FacToilet).toilet).toEqual(vz.toilet);
    expect(badkamerToilet(v!)).toBe(0);
    expect(v!.toiletToegevoegd).toBe(false);
    const k = v!.vertrekken.find((r) => r.type === "woonkamer_ok")!.fac as FacKeuken;
    expect(k.keuken).toEqual(vz.keuken);
    // de voorzieningen tellen mee
    const kaal = berekenVarianten(x, rooms, null, "", N, { keukenOpen: true })[0]!;
    expect(v!.R.totaal).toBeGreaterThan(kaal.R.totaal);
  });

  it("voorzieningenToepassen wijzigt de variant niet", () => {
    const v = {
      vertrekken: [{ type: "keuken", m2: 5, verwarmd: true, fac: facDefault("keuken", true) }],
      overig: [],
    } as unknown as Pick<IndelingVariant, "vertrekken" | "overig">;
    const uit = voorzieningenToepassen(v, vz);
    expect((uit.vertrekken[0]!.fac as FacKeuken).keuken.lengte).toBe(">=2");
    expect((v.vertrekken[0]!.fac as FacKeuken).keuken.lengte).toBe("<1");
    expect(alle(uit)).toHaveLength(1);
  });
});
