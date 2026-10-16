// Adressen bij Bloxs opvragen in porties. Een OData-server weigert een te ingewikkeld filter met
// HTTP 400 (bijv. een maximum aantal knooppunten); daarom kleine porties, en bij een 400 de portie
// halveren en opnieuw proberen. Een 400 voor één enkel adres is een echte fout.
import type { BloxsFout } from "./fouten";
import type { BloxsId } from "./odata";
import type { BloxsAdres, Stap } from "./sync";

/** Adressen per aanvraag (de server staat er maximaal MAX_ADRESSEN toe) */
export const ADRESSEN_PER_PORTIE = 20;

export type PortiesUitkomst =
  | { ok: true; data: BloxsAdres[]; aanvragen: number }
  | { ok: false; fout: BloxsFout | "gestopt"; status?: number; aanvragen: number };

export async function adressenInPorties(
  ids: readonly BloxsId[],
  haal: (ids: BloxsId[]) => Promise<Stap<BloxsAdres[]>>,
  opties: {
    portie?: number;
    gestopt?: () => boolean;
    voortgang?: (klaar: number, totaal: number) => void;
  } = {},
): Promise<PortiesUitkomst> {
  const portie = opties.portie ?? ADRESSEN_PER_PORTIE;
  const rij: BloxsId[][] = [];
  for (let i = 0; i < ids.length; i += portie) rij.push(ids.slice(i, i + portie));
  const data: BloxsAdres[] = [];
  let aanvragen = 0;
  let klaar = 0;
  while (rij.length) {
    if (opties.gestopt?.()) return { ok: false, fout: "gestopt", aanvragen };
    const deel = rij.shift()!;
    const r = await haal(deel);
    aanvragen += r.aanvragen;
    if (!r.ok) {
      if (r.status === 400 && deel.length > 1) {
        const h = Math.ceil(deel.length / 2);
        rij.unshift(deel.slice(0, h), deel.slice(h));
        continue;
      }
      return { ok: false, fout: r.fout, ...(r.status ? { status: r.status } : {}), aanvragen };
    }
    data.push(...r.data);
    klaar += deel.length;
    opties.voortgang?.(klaar, ids.length);
  }
  return { ok: true, data, aanvragen };
}
