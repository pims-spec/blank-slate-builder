// Automatisch een versie vóór "Toepassen" (verbeteradvies of indelingsvariant), zodat de situatie
// vóór het advies altijd bewaard blijft. Bewuste afwijking van de bron: daar gaat de oude situatie
// verloren als je na toepassen opslaat zonder eerst zelf een versie vast te leggen.
import { leesInput, type TellingStaat } from "./doc";
import { legVersieVast, type OpslaanOpties, type TellingStore } from "./store";
import type { Versie } from "./types";

export type AdviesSoort = "vrije sector" | "indeling";

const MAANDEN = [
  "jan",
  "feb",
  "mrt",
  "apr",
  "mei",
  "jun",
  "jul",
  "aug",
  "sep",
  "okt",
  "nov",
  "dec",
];

/** "Vóór advies vrije sector – 20 okt 2026" of "Vóór indelingsadvies – 20 okt 2026" */
export function uitgangsVersieNaam(soort: AdviesSoort, nu: Date): string {
  const datum = nu.getDate() + " " + MAANDEN[nu.getMonth()] + " " + nu.getFullYear();
  return (
    (soort === "indeling" ? "Vóór indelingsadvies" : "Vóór advies vrije sector") + " – " + datum
  );
}

/** JSON met gesorteerde sleutels, zodat de volgorde van velden niet uitmaakt */
function canoniek(x: unknown): string {
  return JSON.stringify(x, (_k, v: unknown) =>
    v && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(
          Object.entries(v as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)),
        )
      : v,
  );
}

/** Zelfde gegevens (adres, eigenaar, invoer) als de vastgelegde versie? */
export function gelijkAanVersie(s: TellingStaat, v: Versie): boolean {
  return (
    canoniek(s.meta) === canoniek(v.meta) &&
    canoniek(leesInput(structuredClone(s.input))) === canoniek(leesInput(structuredClone(v.input)))
  );
}

export interface Uitgangssituatie {
  /** De editorstaat na het vastleggen (ongewijzigd als er niets vastgelegd hoefde) */
  staat: TellingStaat;
  /** De versie die als uitgangssituatie geldt */
  versie: Versie;
  /** false: de situatie was gelijk aan de laatste versie, er is niets nieuws vastgelegd */
  nieuw: boolean;
}

/**
 * Legt de huidige situatie vast als versie vóór een advies wordt toegepast.
 * - nog nooit opgeslagen: legVersieVast slaat eerst de telling op, dan de versie;
 * - gelijk aan de laatste versie: geen dubbele versie (een nieuwe plattegrond staat dan al in
 *   Storage en geeft een ander pad, dus telt als wijziging);
 * - de telling houdt haar naam; de versienaam zegt welk advies erna kwam.
 * Een fout bij opslaan gaat door naar de aanroeper: dan het advies niet toepassen.
 */
export async function bewaarUitgangssituatie(
  store: TellingStore,
  o: OpslaanOpties & {
    soort: AdviesSoort;
    versies: readonly Versie[];
  },
): Promise<Uitgangssituatie> {
  const laatste = [...o.versies].sort((a, b) => b.nr - a.nr)[0];
  if (!o.isNieuw && laatste && gelijkAanVersie(o.staat, laatste))
    return { staat: o.staat, versie: laatste, nieuw: false };
  const r = await legVersieVast(store, {
    ...o,
    naam: uitgangsVersieNaam(o.soort, o.nu ?? new Date()),
    hernoem: false,
  });
  return { ...r, nieuw: true };
}
