// PvE's (programma van eisen) per eigenaar — overgezet uit pveActief(), klantActievePves(),
// normalizeKlantPves(), leegPve(), facIsOnbewerkt(), pasPveOpFac(), pasKlantPveToe() en
// pasPveOpNieuweRuimte() in wws-site.html. pve.vergelijk.test.ts vergelijkt met de bron.
//
// Een PvE vult alleen ruimten aan die nog op hun standaardwaarden staan (dus nog niet met de
// hand zijn ingevuld) en markeert ze met fac.uitPve, zodat ze ter plekke nagelopen worden.
import { facDefault } from "./basis";
import type { Fac, FacBadkamer, FacKeuken, FacToilet, WwsInput } from "./types";

const clone = <T>(o: T): T => JSON.parse(JSON.stringify(o));

export interface PveOnderdeel {
  actief: boolean;
}
/** De velden die de app kent */
export interface PveKern {
  id: string;
  naam: string;
  keuken?: PveOnderdeel & { keuken: FacKeuken["keuken"] };
  badkamer?: PveOnderdeel & { san: FacBadkamer["san"] };
  toilet?: PveOnderdeel & { toilet: FacToilet["toilet"] };
  /** Indelingswensen voor het Indelingsadvies (nog niet in deze app; wel bewaard) */
  indeling?: unknown;
}
/** Een PvE; onbekende velden (bv. van een nieuwere versie) blijven bewaard */
export type Pve = PveKern & { [extra: string]: unknown };
/** Werkexemplaar in het formulier (nog zonder id als het nieuw is) */
export type PveWerk = Omit<PveKern, "id"> & { id?: string } & { [extra: string]: unknown };

/** Nieuw, leeg PvE — leegPve() */
export function leegPve(): PveWerk {
  return {
    naam: "",
    keuken: { actief: false, keuken: { lengte: "1-2", voorz: {} } },
    badkamer: {
      actief: false,
      san: {
        toiletStaand: 0,
        toiletHang: 0,
        wastafel: 1,
        meerpers: 0,
        douche: 1,
        bad: 0,
        badDouche: 0,
        eisenOk: true,
        voorz: {},
      },
    },
    toilet: { actief: false, toilet: { toilet: "staand", fontein: false } },
    indeling: {
      apartToilet: "auto",
      wasruimte: "auto",
      keuken: "auto",
      slaapkamers: "",
      verwarmd: {},
    },
  };
}

/** Heeft dit PvE minstens één ingesteld onderdeel? — pveActief() */
export function pveActief(p: Partial<PveKern> | null | undefined): boolean {
  return !!(
    p &&
    ((p.keuken && p.keuken.actief) ||
      (p.badkamer && p.badkamer.actief) ||
      (p.toilet && p.toilet.actief))
  );
}

export function actievePves(pves: readonly Pve[]): Pve[] {
  return pves.filter(pveActief);
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * De PvE's van een eigenaar uit klanten.pve: al een lijst? dan die; een los (oud) PvE-object
 * met keuken/badkamer/toilet? dan een lijst met dat ene PvE, "Standaard"; anders leeg.
 * Ontbrekende id's en namen worden aangevuld — normalizeKlantPves().
 */
export function normaliseerPves(raw: unknown, uid: () => string): Pve[] {
  let pves: unknown[];
  if (Array.isArray(raw)) pves = raw;
  else if (isObj(raw) && (raw["keuken"] || raw["badkamer"] || raw["toilet"]))
    pves = [Object.assign({ id: uid(), naam: "Standaard" }, clone(raw))];
  else pves = [];
  return pves.map((p) => {
    const o = (isObj(p) ? p : {}) as Obj;
    return Object.assign({}, o, {
      id: (o["id"] as string) || uid(),
      naam: (o["naam"] as string) || "Standaard",
    }) as Pve;
  });
}

/** Staat deze ruimte nog op de standaardwaarden van een nieuwe ruimte? — facIsOnbewerkt() */
export function facIsOnbewerkt(f: Fac | undefined): boolean {
  if (!f) return false;
  const basis = facDefault(f.kind, false);
  if (f.kind === "keuken" && basis.kind === "keuken")
    return (
      f.keuken.lengte === basis.keuken.lengte &&
      JSON.stringify(f.keuken.voorz || {}) === JSON.stringify(basis.keuken.voorz || {})
    );
  if (f.kind === "badkamer" && basis.kind === "badkamer")
    return JSON.stringify(f.san || {}) === JSON.stringify(basis.san || {});
  if (f.kind === "toilet" && basis.kind === "toilet")
    return f.toilet.toilet === basis.toilet.toilet && !!f.toilet.fontein === !!basis.toilet.fontein;
  return false;
}

/**
 * Past het PvE toe op één voorziening (muteert f), als dat onderdeel actief is en de ruimte
 * nog onbewerkt is — pasPveOpFac(). Geeft terug of er iets is aangepast.
 */
export function pasPveOpFac(f: Fac | undefined, p: Pve | null | undefined): boolean {
  if (!f || !p) return false;
  if (f.kind === "keuken" && p.keuken && p.keuken.actief && facIsOnbewerkt(f)) {
    f.keuken = clone(p.keuken.keuken);
    f.uitPve = true;
    return true;
  }
  if (f.kind === "badkamer" && p.badkamer && p.badkamer.actief && facIsOnbewerkt(f)) {
    f.san = clone(p.badkamer.san);
    f.uitPve = true;
    return true;
  }
  if (f.kind === "toilet" && p.toilet && p.toilet.actief && facIsOnbewerkt(f)) {
    f.toilet = clone(p.toilet.toilet);
    f.uitPve = true;
    return true;
  }
  return false;
}

export interface PveResultaat {
  input: WwsInput;
  /** Ruimten die uit het PvE zijn aangevuld */
  aangepast: number;
  /** Ruimten met een actief onderdeel die al met de hand waren ingevuld */
  overgeslagen: number;
}

/** Het PvE op de hele telling toepassen (na bevestiging) — pasKlantPveToe(). Wijzigt input niet. */
export function pasPveToe(input: WwsInput, p: Pve): PveResultaat {
  const uit = clone(input);
  let aangepast = 0,
    overgeslagen = 0;
  for (const r of [...uit.vertrekken, ...uit.overig]) {
    const f = r.fac;
    if (!f) continue;
    const onderdeelActief =
      (f.kind === "keuken" && p.keuken && p.keuken.actief) ||
      (f.kind === "badkamer" && p.badkamer && p.badkamer.actief) ||
      (f.kind === "toilet" && p.toilet && p.toilet.actief);
    if (!onderdeelActief) continue;
    if (pasPveOpFac(f, p)) aangepast++;
    else overgeslagen++;
  }
  return { input: uit, aangepast, overgeslagen };
}

/**
 * Welk PvE geldt voor stil aanvullen: het gekozen PvE (meta.pveId), of — als de eigenaar er
 * maar één actief heeft — dat ene — zoals in pasPveOpNieuweRuimte().
 */
export function pveVoorTelling(pves: readonly Pve[], pveId: string | undefined): Pve | null {
  const actief = actievePves(pves);
  return pves.find((p) => p.id === pveId) ?? (actief.length === 1 ? actief[0]! : null);
}

// ---------- formulier ----------

/** Werkexemplaar voor het formulier: standaardvelden aangevuld, ALLE overige velden bewaard */
export function pveVoorFormulier(bestaand: Partial<PveKern> | null): PveWerk {
  const basis = leegPve();
  const opg = clone(bestaand ?? {}) as Partial<PveKern>;
  return {
    ...opg,
    naam: opg.naam || "",
    keuken: {
      ...basis.keuken!,
      ...opg.keuken,
      keuken: { ...basis.keuken!.keuken, ...opg.keuken?.keuken },
    },
    badkamer: {
      ...basis.badkamer!,
      ...opg.badkamer,
      san: { ...basis.badkamer!.san, ...opg.badkamer?.san },
    },
    toilet: {
      ...basis.toilet!,
      ...opg.toilet,
      toilet: { ...basis.toilet!.toilet, ...opg.toilet?.toilet },
    },
    indeling: opg.indeling !== undefined ? opg.indeling : basis.indeling,
  };
}

/**
 * Een opgeslagen PvE uit het formulier: naam en id gezet, en wat het formulier niet kent
 * (zoals de indelingswensen, of velden van een nieuwere versie) blijft altijd bewaard.
 */
export function pveUitFormulier(
  werk: PveWerk,
  bestaand: Partial<PveKern> | null,
  naam: string,
  uid: () => string,
): Pve {
  return {
    ...clone(bestaand ?? {}),
    ...clone(werk),
    naam: naam.trim(),
    id: bestaand?.id || werk.id || uid(),
  } as Pve;
}

/** Een PvE-naam is uniek per eigenaar (hoofdletterongevoelig) */
export function pveNaamBestaat(pves: readonly Pve[], naam: string, behalveId?: string): boolean {
  const n = naam.trim().toLowerCase();
  return pves.some((p) => p.id !== behalveId && p.naam.toLowerCase() === n);
}
