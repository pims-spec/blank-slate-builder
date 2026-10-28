// Een gebruiker verwijderen door een beheerder, met overdracht naar een ontvanger. Tellingen en
// huurindicaties hebben owner_id "on delete cascade": zonder overdracht verdwijnen ze met het
// account. Daarom eerst overdragen, dan controleren dat er niets meer op naam staat, en pas dan het
// account verwijderen. Versies en plattegronden hangen aan de telling-id en gaan vanzelf mee.
// Portefeuilles kunnen niet van maker wisselen (trigger): die worden gedeeld met de ontvanger.
// Halverwege mislukt? Opnieuw uitvoeren maakt het af (elke stap is herhaalbaar).
import { rechtenVan, type AppRole } from "@/lib/rollen";

export interface Bezit {
  tellingen: number;
  huurindicaties: number;
  portefeuilles: number;
}

/** Het deel van de database dat nodig is; elke methode geeft null of false bij een fout */
export interface OverdrachtDb {
  rollenVan(userId: string): Promise<AppRole[] | null>;
  telBezit(userId: string): Promise<Bezit | null>;
  trekRollenIn(userId: string): Promise<boolean>;
  /** owner_id van → naar; geeft de ids van de overgedragen tellingen */
  draagTellingenOver(van: string, naar: string): Promise<string[] | null>;
  draagHuurindicatiesOver(van: string, naar: string): Promise<number | null>;
  /** Delingen met de ontvanger zelf zijn na de overdracht overbodig */
  ruimDelingenOp(tellingIds: string[], naar: string): Promise<boolean>;
  /** Deelt de portefeuilles van `van` met `naar` (die nog niet gedeeld zijn); geeft het aantal */
  deelPortefeuilles(van: string, naar: string): Promise<number | null>;
  verwijderAccount(userId: string): Promise<boolean>;
}

export type OverdrachtFout =
  | "eigen_account"
  | "zelfde_ontvanger"
  | "ontvanger_geen_schrijfrol"
  | "niet_alles_overgedragen"
  | "mislukt";

export type OverdrachtResultaat =
  | { ok: true; tellingen: number; huurindicaties: number; portefeuilles: number }
  | { ok: false; fout: OverdrachtFout };

/** Mag `beheerder` `gebruiker` verwijderen met `ontvanger` als nieuwe eigenaar? */
export function controleerOverdracht(o: {
  beheerder: string;
  gebruiker: string;
  ontvanger: string;
  rollenOntvanger: readonly AppRole[];
}): OverdrachtFout | null {
  if (o.gebruiker === o.beheerder) return "eigen_account";
  if (o.ontvanger === o.gebruiker) return "zelfde_ontvanger";
  if (!rechtenVan(o.rollenOntvanger).magSchrijven) return "ontvanger_geen_schrijfrol";
  return null;
}

/** Wie kan de tellingen krijgen: iedereen met een schrijfrol, behalve wie verwijderd wordt */
export function ontvangers<T extends { id: string; magSchrijven: boolean }>(
  gebruikers: readonly T[],
  teVerwijderen: string,
): T[] {
  return gebruikers.filter((g) => g.magSchrijven && g.id !== teVerwijderen);
}

export async function verwijderMetOverdracht(
  db: OverdrachtDb,
  beheerder: string,
  gebruiker: string,
  ontvanger: string,
): Promise<OverdrachtResultaat> {
  const rollen = await db.rollenVan(ontvanger);
  if (!rollen) return { ok: false, fout: "mislukt" };
  const fout = controleerOverdracht({ beheerder, gebruiker, ontvanger, rollenOntvanger: rollen });
  if (fout) return { ok: false, fout };

  // Eerst de rollen weg: daarna kan de gebruiker niets nieuws maken dat alsnog zou verdwijnen
  if (!(await db.trekRollenIn(gebruiker))) return { ok: false, fout: "mislukt" };
  const ids = await db.draagTellingenOver(gebruiker, ontvanger);
  if (!ids) return { ok: false, fout: "mislukt" };
  const huurindicaties = await db.draagHuurindicatiesOver(gebruiker, ontvanger);
  if (huurindicaties === null) return { ok: false, fout: "mislukt" };
  if (ids.length && !(await db.ruimDelingenOp(ids, ontvanger)))
    return { ok: false, fout: "mislukt" };
  // Een beheerder ziet alle portefeuilles al, en met jezelf delen kan niet
  const portefeuilles =
    ontvanger === beheerder ? 0 : await db.deelPortefeuilles(gebruiker, ontvanger);
  if (portefeuilles === null) return { ok: false, fout: "mislukt" };

  const rest = await db.telBezit(gebruiker);
  if (!rest) return { ok: false, fout: "mislukt" };
  if (rest.tellingen || rest.huurindicaties) return { ok: false, fout: "niet_alles_overgedragen" };
  if (!(await db.verwijderAccount(gebruiker))) return { ok: false, fout: "mislukt" };

  console.info(
    `[gebruiker] verwijderd door een beheerder: ${ids.length} telling(en), ${huurindicaties} huurindicatie(s) overgedragen`,
  );
  return { ok: true, tellingen: ids.length, huurindicaties, portefeuilles };
}

const meervoud = (n: number, een: string, meer: string) => `${n} ${n === 1 ? een : meer}`;

/** "12 tellingen (met versies) en 3 huurindicaties" — alleen wat er is */
export function bezitTekst(b: Pick<Bezit, "tellingen" | "huurindicaties">): string {
  const delen = [meervoud(b.tellingen, "telling", "tellingen") + " (met versies)"];
  if (b.huurindicaties) delen.push(meervoud(b.huurindicaties, "huurindicatie", "huurindicaties"));
  return delen.join(" en ");
}

/** "12 tellingen (met versies) gaan naar Els." — de bevestiging vóór het verwijderen */
export function overdrachtZin(
  b: Pick<Bezit, "tellingen" | "huurindicaties">,
  naar: string | null,
): string {
  const ww = b.tellingen + b.huurindicaties === 1 ? "gaat" : "gaan";
  return `${bezitTekst(b)} ${ww} naar ${naar || "de gekozen collega"}.`;
}

export function portefeuilleTekst(n: number): string {
  return `${meervoud(n, "portefeuille wordt", "portefeuilles worden")} gedeeld met de ontvanger.`;
}

export const OVERDRACHT_FOUTEN: Record<OverdrachtFout, string> = {
  eigen_account: "Je eigen account kun je niet verwijderen.",
  zelfde_ontvanger: "Kies een andere collega als ontvanger.",
  ontvanger_geen_schrijfrol: "De ontvanger moet Collega of Beheerder zijn.",
  niet_alles_overgedragen:
    "Niet alles kon worden overgedragen. Het account is niet verwijderd; probeer het opnieuw.",
  mislukt:
    "Verwijderen lukte niet. Wat al is overgedragen blijft staan; probeer het opnieuw om het af te maken.",
};
