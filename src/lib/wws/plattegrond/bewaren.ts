// Opslaan met een nieuwe plattegrond: de afbeelding gaat naar Storage, de telling krijgt alleen
// de verwijzing. Een nieuwe telling wordt eerst aangemaakt (de policy vereist een bestaande
// telling). Na het opslaan wordt de vorige afbeelding opgeruimd, tenzij een versie hem gebruikt.
import { slaWerkversieOp, type TellingStore } from "../opslag/store";
import type { Bewerker, Versie } from "../opslag/types";
import type { TellingStaat } from "../opslag/doc";
import type { Normen } from "../normen";
import { oudeAfbeeldingOpruimen, type PlattegrondOpslag } from "./opslag";

export interface TeBewarenBeeld {
  bytes: Uint8Array;
  breedte: number;
  hoogte: number;
}

/**
 * Zet een nieuwe afbeelding in Storage en geeft de staat met de verwijzing terug (zonder een
 * oude plattegrondImg). isNieuw is daarna altijd false: de telling bestaat dan.
 */
export async function bewaarBeeld(o: {
  store: TellingStore;
  opslag: PlattegrondOpslag;
  id: string;
  isNieuw: boolean;
  staat: TellingStaat;
  normen: Normen;
  bewerker: Bewerker | null;
  beeld: TeBewarenBeeld | null;
}): Promise<{ staat: TellingStaat; isNieuw: boolean }> {
  if (!o.beeld) return { staat: o.staat, isNieuw: o.isNieuw };
  if (o.isNieuw) await slaWerkversieOp(o.store, { ...o, isNieuw: true });
  const ref = await o.opslag.bewaar(o.id, o.beeld.bytes, o.beeld);
  const input = { ...o.staat.input, plattegrond: ref };
  delete input.plattegrondImg;
  return { staat: { ...o.staat, input }, isNieuw: false };
}

/** Na het opslaan: de vorige afbeelding weg als niets er nog naar verwijst. Fouten alleen gelogd. */
export async function ruimOudBeeldOp(
  opslag: PlattegrondOpslag,
  vorigPad: string | null,
  nieuwPad: string | null,
  versies: readonly Pick<Versie, "input">[],
): Promise<void> {
  const weg = oudeAfbeeldingOpruimen(
    vorigPad ? { pad: vorigPad, breedte: 0, hoogte: 0 } : null,
    nieuwPad ? { pad: nieuwPad, breedte: 0, hoogte: 0 } : null,
    versies.map((v) => v.input.plattegrond?.pad),
  );
  if (!weg.length) return;
  try {
    await opslag.verwijder(weg);
  } catch {
    console.warn("[plattegrond] oude afbeelding opruimen mislukt");
  }
}
