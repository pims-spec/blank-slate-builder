import { describe, expect, it } from "vitest";
import { facDefault } from "../basis";
import { DEFAULT_NORMEN as NORMEN } from "../normen";
import type { FacBadkamer, FacKeuken, FacToilet } from "../types";
import type { Beoordeling, ElementOordeel } from "./beoordeling";
import { ELEMENTEN, type FotoRuimte } from "./elementen";
import {
  fotoAllesGecontroleerd,
  fotoRuimteVoor,
  fotoStand,
  fotoVeldGecontroleerd,
  pasFotosToe,
} from "./invullen";

const o = (over: Partial<ElementOordeel> = {}): ElementOordeel => ({
  status: "niet_vast_te_stellen",
  vrijstaand: false,
  aantal: null,
  soort: null,
  bewijs: "Niet te zien.",
  fotos: [],
  ...over,
});
const ja = (over: Partial<ElementOordeel> = {}) =>
  o({ status: "aanwezig", bewijs: "Duidelijk te zien.", fotos: [1], ...over });
const misschien = (over: Partial<ElementOordeel> = {}) =>
  o({ status: "waarschijnlijk_aanwezig", bewijs: "Front zonder scharnier.", fotos: [2], ...over });

/** Een volledige beoordeling: alles niet vast te stellen, behalve wat is opgegeven */
function beoordeling(ruimte: FotoRuimte, over: Record<string, ElementOordeel> = {}): Beoordeling {
  return Object.fromEntries(ELEMENTEN[ruimte].map((e) => [e.sleutel, over[e.sleutel] ?? o()]));
}

const keuken = () => facDefault("keuken") as FacKeuken;
const badkamer = () => facDefault("badkamer") as FacBadkamer;
const toilet = () => facDefault("toilet") as FacToilet;

describe("pasFotosToe: keuken", () => {
  it("aanwezig vult in zonder !, waarschijnlijk vult in met !, niet vast te stellen alleen !", () => {
    const r = pasFotosToe(
      keuken(),
      "keuken",
      beoordeling("keuken", {
        aanrecht: ja({ soort: ">=2" }),
        koelkast: ja(),
        vaatwasser: misschien(),
        kookplaat: ja({ soort: "inductie" }),
      }),
    )!;
    const f = r.fac as FacKeuken;
    expect(f.keuken.lengte).toBe(">=2");
    expect(f.keuken.voorz).toMatchObject({ koelkast: true, vaatwasser: true, kook_ind: true });
    expect(f.keuken.voorz.oven).toBeUndefined();
    expect(f.uitFoto).toBe(true);
    const m = f.fotoOnzeker!;
    expect(m["koelkast"]).toBeUndefined();
    expect(m["kook"]).toBeUndefined();
    expect(m["lengte"]).toBeUndefined();
    expect(m["vaatwasser"]).toBe("Waarschijnlijk aanwezig: Front zonder scharnier.");
    expect(m["oven"]).toBe("Niet vast te stellen: Niet te zien.");
    expect(m["afzuig"]).toMatch(/^Niet vast te stellen/);
    expect(r.onzeker).toBe(Object.keys(m).length);
  });

  it("vrijstaand telt niet en krijgt geen !, tenzij de telling hem wel meetelt", () => {
    const f = keuken();
    f.keuken.voorz.koelkast = true;
    const uit = pasFotosToe(
      f,
      "keuken",
      beoordeling("keuken", {
        magnetron: ja({ vrijstaand: true }),
        koelkast: ja({ vrijstaand: true }),
      }),
    )!.fac as FacKeuken;
    expect(uit.keuken.voorz.magnetron).toBeUndefined();
    expect(uit.fotoOnzeker!["magnetron"]).toBeUndefined();
    expect(uit.keuken.voorz.koelkast).toBe(true);
    expect(uit.fotoOnzeker!["koelkast"]).toMatch(/vrijstaand; dat telt niet/);
  });

  it("soort niet te zien: de laagst tellende soort, met !", () => {
    const uit = pasFotosToe(
      keuken(),
      "keuken",
      beoordeling("keuken", { kookplaat: ja(), oven: ja(), kraan: ja() }),
    )!.fac as FacKeuken;
    expect(uit.keuken.voorz).toMatchObject({ kook_gas: true, oven_gas: true, kraan_een: true });
    for (const g of ["kook", "oven", "kraan"])
      expect(uit.fotoOnzeker![g]).toMatch(/laagst tellende/);
  });

  it("de laagste soort is ook de laagst tellende in de normen", () => {
    const p = (k: string) => NORMEN.voorzKeuken.find((v) => v.k === k)!.p;
    expect(p("kook_gas")).toBeLessThan(p("kook_kera"));
    expect(p("kook_kera")).toBeLessThan(p("kook_ind"));
    expect(p("oven_gas")).toBeLessThan(p("oven"));
    expect(p("kraan_een")).toBeLessThan(p("kraan_thermo"));
  });

  it("combimagnetron: oven en magnetron allebei aangevinkt", () => {
    const uit = pasFotosToe(
      keuken(),
      "keuken",
      beoordeling("keuken", { oven: ja({ soort: "elektrisch" }), magnetron: ja() }),
    )!.fac as FacKeuken;
    expect(uit.keuken.voorz).toMatchObject({ oven: true, magnetron: true });
  });

  it("nooit lager: een hogere soort of langer aanrecht blijft staan, met !", () => {
    const f = keuken();
    f.keuken.lengte = ">=2";
    f.keuken.voorz.kook_ind = true;
    const uit = pasFotosToe(
      f,
      "keuken",
      beoordeling("keuken", { aanrecht: ja({ soort: "1-2" }), kookplaat: ja({ soort: "gas" }) }),
    )!.fac as FacKeuken;
    expect(uit.keuken.lengte).toBe(">=2");
    expect(uit.keuken.voorz.kook_ind).toBe(true);
    expect(uit.keuken.voorz.kook_gas).toBeUndefined();
    expect(uit.fotoOnzeker!["lengte"]).toBe(
      "Op de foto's aanrecht 1 tot 2 m; in de telling staat aanrecht 2 m of meer.",
    );
    expect(uit.fotoOnzeker!["kook"]).toBe("Op de foto's gas; in de telling staat inductie.");
  });

  it("een hogere soort vervangt de lagere in dezelfde groep", () => {
    const f = keuken();
    f.keuken.voorz.kook_gas = true;
    const uit = pasFotosToe(
      f,
      "keuken",
      beoordeling("keuken", { kookplaat: ja({ soort: "inductie" }) }),
    )!.fac as FacKeuken;
    expect(uit.keuken.voorz.kook_gas).toBeUndefined();
    expect(uit.keuken.voorz.kook_ind).toBe(true);
  });

  it("aanrechtlengte niet te schatten: lengte blijft, met !", () => {
    const uit = pasFotosToe(keuken(), "keuken", beoordeling("keuken", { aanrecht: ja() }))!
      .fac as FacKeuken;
    expect(uit.keuken.lengte).toBe("1-2");
    expect(uit.fotoOnzeker!["lengte"]).toMatch(/^Niet te schatten/);
  });

  it("keukenkasten: altijd ! (schatting); nooit minder dan er staat", () => {
    const uit = pasFotosToe(keuken(), "keuken", beoordeling("keuken", { kast: ja({ aantal: 4 }) }))!
      .fac as FacKeuken;
    expect(uit.keuken.voorz.kast).toBe(4);
    expect(uit.fotoOnzeker!["kast"]).toMatch(/schatting/);

    const f = keuken();
    f.keuken.voorz.kast = "6";
    const uit2 = pasFotosToe(f, "keuken", beoordeling("keuken", { kast: ja({ aantal: 4 }) }))!
      .fac as FacKeuken;
    expect(uit2.keuken.voorz.kast).toBe("6");
    expect(uit2.fotoOnzeker!["kast"]).toMatch(/Op de foto's 4; in de telling staan er meer/);
  });

  it("wist nooit iets: wat al aan stond blijft aan, ook als de AI het niet ziet", () => {
    const f = keuken();
    f.keuken.voorz = { afzuig: true, kokend: true };
    const uit = pasFotosToe(f, "keuken", beoordeling("keuken"))!.fac as FacKeuken;
    expect(uit.keuken.voorz).toMatchObject({ afzuig: true, kokend: true });
    expect(uit.fotoOnzeker!["afzuig"]).toMatch(/^Niet vast te stellen/);
  });
});

describe("pasFotosToe: badkamer", () => {
  it("aantallen, extra voorzieningen en toilet; eisenOk blijft van de gebruiker", () => {
    const f = badkamer();
    f.san.eisenOk = false;
    const uit = pasFotosToe(
      f,
      "badkamer",
      beoordeling("badkamer", {
        toilet: ja({ aantal: 1, soort: "hangend" }),
        wastafel: ja({ aantal: 1 }),
        douche: ja({ aantal: 1 }),
        afscheiding: ja(),
        handdoekrad: ja({ aantal: 1 }),
        stopcontact: misschien({ aantal: 2 }),
        kraan_thermo: ja({ aantal: 1 }),
      }),
    )!.fac as FacBadkamer;
    expect(uit.san).toMatchObject({
      toiletHang: 1,
      toiletStaand: 0,
      wastafel: 1,
      douche: 1,
      eisenOk: false,
    });
    expect(uit.san.voorz).toMatchObject({
      afscheiding: true,
      handdoekrad: 1,
      stopcontact: 2,
      kraan_thermo: 1,
    });
    expect(uit.fotoOnzeker!["toilet"]).toBeUndefined();
    expect(uit.fotoOnzeker!["stopcontact"]).toMatch(/^Waarschijnlijk aanwezig/);
    expect(uit.fotoOnzeker!["bad"]).toMatch(/^Niet vast te stellen/);
  });

  it("aanwezig zonder aantal: 1, met !", () => {
    const uit = pasFotosToe(badkamer(), "badkamer", beoordeling("badkamer", { kastje: ja() }))!
      .fac as FacBadkamer;
    expect(uit.san.voorz.kastje).toBe(1);
    expect(uit.fotoOnzeker!["kastje"]).toMatch(/Aantal niet te tellen/);
  });

  it("toilet zonder soort: staand, met !; nooit meer toiletten weg", () => {
    const uit = pasFotosToe(
      badkamer(),
      "badkamer",
      beoordeling("badkamer", { toilet: ja({ aantal: 1 }) }),
    )!.fac as FacBadkamer;
    expect(uit.san.toiletStaand).toBe(1);
    expect(uit.fotoOnzeker!["toilet"]).toMatch(/staand ingevuld/);

    const f = badkamer();
    f.san.toiletHang = 2;
    const uit2 = pasFotosToe(
      f,
      "badkamer",
      beoordeling("badkamer", { toilet: ja({ aantal: 1, soort: "staand" }) }),
    )!.fac as FacBadkamer;
    expect(uit2.san).toMatchObject({ toiletHang: 2, toiletStaand: 0 });
    expect(uit2.fotoOnzeker!["toilet"]).toMatch(/in de telling staan er meer/);
  });

  it("standaard één douche: AI ziet geen douche → douche blijft, met !", () => {
    const uit = pasFotosToe(badkamer(), "badkamer", beoordeling("badkamer"))!.fac as FacBadkamer;
    expect(uit.san.douche).toBe(1);
    expect(uit.fotoOnzeker!["douche"]).toMatch(/^Niet vast te stellen/);
  });
});

describe("pasFotosToe: toiletruimte", () => {
  it("hangend gaat boven staand; fontein aan", () => {
    const uit = pasFotosToe(
      toilet(),
      "toilet",
      beoordeling("toilet", { toilet: ja({ soort: "hangend" }), fontein: ja() }),
    )!.fac as FacToilet;
    expect(uit.toilet).toEqual({ toilet: "hangend", fontein: true });
    expect(uit.fotoOnzeker).toBeUndefined();
  });

  it("geen toilet in de telling, AI ziet er een zonder soort: staand, met !", () => {
    const f = facDefault("toilet", true) as FacToilet;
    const uit = pasFotosToe(f, "toilet", beoordeling("toilet", { toilet: ja() }))!.fac as FacToilet;
    expect(uit.toilet.toilet).toBe("staand");
    expect(uit.fotoOnzeker!["toilet"]).toMatch(/laagst tellende/);
  });

  it("hangend in de telling, AI ziet staand: blijft hangend, met !", () => {
    const f = toilet();
    f.toilet.toilet = "hangend";
    const uit = pasFotosToe(
      f,
      "toilet",
      beoordeling("toilet", { toilet: ja({ soort: "staand" }), fontein: ja() }),
    )!.fac as FacToilet;
    expect(uit.toilet.toilet).toBe("hangend");
    expect(uit.fotoOnzeker!["toilet"]).toBe(
      "Op de foto's staand toilet; in de telling staat hangend toilet.",
    );
  });
});

describe("algemeen", () => {
  it("wijzigt de invoer niet; vervangt de PvE-markering en eerdere !", () => {
    const f = keuken();
    f.uitPve = true;
    f.fotoOnzeker = { oud: "van een eerdere beoordeling" };
    const voor = JSON.stringify(f);
    const uit = pasFotosToe(
      f,
      "keuken",
      Object.fromEntries(
        ELEMENTEN.keuken.map((e) => [
          e.sleutel,
          ja({ soort: e.soorten?.[0] ?? null, aantal: e.telbaar ? 1 : null }),
        ]),
      ),
    )!.fac as FacKeuken;
    expect(JSON.stringify(f)).toBe(voor);
    expect(uit.uitPve).toBeUndefined();
    expect(uit.fotoOnzeker?.["oud"]).toBeUndefined();
  });

  it("alles zeker: geen fotoOnzeker", () => {
    const uit = pasFotosToe(
      toilet(),
      "toilet",
      beoordeling("toilet", { toilet: ja({ soort: "staand" }), fontein: ja() }),
    )!;
    expect(uit.onzeker).toBe(0);
    expect(uit.fac).not.toHaveProperty("fotoOnzeker");
  });

  it("verkeerde ruimte: null", () => {
    expect(pasFotosToe(keuken(), "badkamer", beoordeling("badkamer"))).toBeNull();
    expect(pasFotosToe(facDefault("slaap_san"), "badkamer", beoordeling("badkamer"))).toBeNull();
    expect(fotoRuimteVoor(facDefault("was"))).toBeNull();
    expect(fotoRuimteVoor(badkamer())).toBe("badkamer");
  });

  it("fotoVeldGecontroleerd haalt één ! weg; zonder ! verdwijnt ook uitFoto", () => {
    const f = keuken();
    f.uitFoto = true;
    f.fotoOnzeker = { oven: "a", kook: "b" };
    fotoVeldGecontroleerd(f, "oven");
    expect(f.fotoOnzeker).toEqual({ kook: "b" });
    expect(f.uitFoto).toBe(true);
    fotoVeldGecontroleerd(f, "kook");
    expect(f).not.toHaveProperty("fotoOnzeker");
    expect(f).not.toHaveProperty("uitFoto");
  });

  it("fotoStand en fotoAllesGecontroleerd", () => {
    const f = keuken();
    expect(fotoStand(f)).toEqual({ uitFoto: false, onzeker: {} });
    f.uitFoto = true;
    f.fotoOnzeker = { oven: "a" };
    expect(fotoStand(f)).toEqual({ uitFoto: true, onzeker: { oven: "a" } });
    fotoAllesGecontroleerd(f);
    expect(f).toEqual(keuken());
    expect(fotoStand(facDefault("was"))).toEqual({ uitFoto: false, onzeker: {} });
  });
});
