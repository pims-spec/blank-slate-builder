// Van de objecten en adressen uit Bloxs naar wat er in de database komt (pure functie): unieke
// adressen (meerdere objecten kunnen één adres delen, bijv. kamers), per object het adres waar
// het bij hoort, en de objecten zonder bruikbaar adres (om te controleren, niet opgeslagen als adres).
import { adresSleutel, type PortefeuilleAdres } from "../portefeuille/adres";
import type { BloxsId } from "./odata";
import type { BloxsAdres, BloxsObject, Soort } from "./sync";

export interface SyncPlan {
  adressen: PortefeuilleAdres[];
  objecten: { soort: Soort; ref: string; adresSleutel: string | null }[];
  zonderAdres: { referentie: string; reden: "geen_adres" | "niet_te_splitsen"; ruw?: string }[];
  /** Aantal objecten dat een adres deelt met een ander object */
  gedeeld: number;
}

/** De AddressId's die opgevraagd moeten worden (uniek, in de volgorde van de objecten) */
export function adresIds(objecten: readonly BloxsObject[]): BloxsId[] {
  const gezien = new Map<string, BloxsId>();
  for (const o of objecten) if (o.adresId != null) gezien.set(String(o.adresId), o.adresId);
  return [...gezien.values()];
}

export function maakSyncPlan(
  objecten: readonly BloxsObject[],
  adressen: readonly BloxsAdres[],
): SyncPlan {
  const perId = new Map(adressen.map((a) => [a.adresId, a]));
  const uniek = new Map<string, PortefeuilleAdres>();
  const perSleutel = new Map<string, number>();
  const plan: SyncPlan = { adressen: [], objecten: [], zonderAdres: [], gedeeld: 0 };
  for (const o of objecten) {
    const naam = o.referentie ?? o.ref;
    const a = o.adresId == null ? undefined : perId.get(String(o.adresId));
    if (!a) {
      plan.zonderAdres.push({ referentie: naam, reden: "geen_adres" });
      plan.objecten.push({ soort: o.soort, ref: o.ref, adresSleutel: null });
      continue;
    }
    if (!a.ok) {
      plan.zonderAdres.push({ referentie: naam, reden: "niet_te_splitsen", ruw: a.ruw });
      plan.objecten.push({ soort: o.soort, ref: o.ref, adresSleutel: null });
      continue;
    }
    const adres: PortefeuilleAdres = {
      postcode: a.postcode,
      huisnummer: a.huisnummer,
      huisletter: a.huisletter,
      toevoeging: a.toevoeging,
      straat: a.straat ?? null,
      woonplaats: a.woonplaats ?? null,
    };
    const k = adresSleutel(adres);
    if (!uniek.has(k)) uniek.set(k, adres);
    perSleutel.set(k, (perSleutel.get(k) ?? 0) + 1);
    plan.objecten.push({ soort: o.soort, ref: o.ref, adresSleutel: k });
  }
  plan.adressen = [...uniek.values()];
  for (const n of perSleutel.values()) if (n > 1) plan.gedeeld += n;
  return plan;
}

/** Complexen onder de opgehaalde units (voor de keuze "alleen dit complex") */
export function complexen(objecten: readonly BloxsObject[]) {
  const m = new Map<string, { id: BloxsId; naam: string; aantal: number }>();
  for (const o of objecten) {
    if (o.complexId == null) continue;
    const k = String(o.complexId);
    const c = m.get(k) ?? { id: o.complexId, naam: o.complexNaam ?? "Complex " + k, aantal: 0 };
    c.aantal++;
    m.set(k, c);
  }
  return [...m.values()].sort((a, b) => a.naam.localeCompare(b.naam, "nl"));
}

/** Een opgeslagen id terug naar de vorm van de feed (cijfers → getal) */
export const idUitTekst = (s: string): BloxsId => (/^\d{1,15}$/.test(s) ? Number(s) : s);
