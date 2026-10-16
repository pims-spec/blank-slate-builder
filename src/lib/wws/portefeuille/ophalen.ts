// Van een EP-Online-antwoord naar het resultaat dat per adres wordt opgeslagen (label_resultaten).
// Problemen met de sleutel, de dienst of te veel verzoeken stoppen het ophalen: daarvan wordt
// niets opgeslagen, zodat "hervatten" die adressen later gewoon opnieuw probeert.
import type { EpLabel } from "../opzoeken/eponline";
import { epToIsoDate } from "../opzoeken/eponline";
import type { OpzoekFout, Opzoeking } from "../opzoeken/dienst";
import type { LabelResultaat } from "./analyse";

/** Fouten waarbij het ophalen stopt (niet per adres opslaan) */
export type StopFout = Exclude<OpzoekFout, "niet_gevonden" | "ongeldige_invoer">;

export interface OpgeslagenResultaat extends LabelResultaat {
  opnamedatum: string | null;
  energieIndex: number | null;
  gebouwtype: string | null;
}

const leeg = (status: LabelResultaat["status"], nu: string): OpgeslagenResultaat => ({
  status,
  energieklasse: null,
  registratiedatum: null,
  geldigTot: null,
  opgehaaldOp: nu,
  opnamedatum: null,
  energieIndex: null,
  gebouwtype: null,
});

/** Resultaat voor een adres dat EP-Online niet kan zoeken (zonder aanvraag): "mislukt" */
export const ongeldigAdres = (nu: string) => leeg("fout", nu);

/**
 * Een huisnummertoevoeging zoals de BAG die kent: hooguit 4 letters of cijfers. Iets als "GARAGE"
 * (uit Bloxs) is geen adres in de BAG; daarvoor geen aanvraag bij EP-Online.
 */
export const bagToevoegingOk = (t: string) => t === "" || /^[A-Za-z0-9]{1,4}$/.test(t);

const datum = (v: unknown) => epToIsoDate(v) || null;

function getal(v: unknown): number | null {
  const n = typeof v === "number" ? v : Number(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) && v !== null && v !== "" && Math.abs(n) < 1000 ? n : null;
}

/** Eén label → gevonden; meerdere verschillende labels → niet eenduidig ("meerdere") */
export function resultaatUitEp(
  r: Opzoeking<EpLabel[]>,
  nu: string,
): { resultaat: OpgeslagenResultaat } | { stop: StopFout } {
  if (!r.ok) {
    if (r.fout === "niet_gevonden") return { resultaat: leeg("niet_gevonden", nu) };
    if (r.fout === "ongeldige_invoer") return { resultaat: leeg("fout", nu) };
    return { stop: r.fout };
  }
  const uniek = new Map<string, EpLabel>();
  for (const l of r.data)
    uniek.set([l.Energieklasse ?? "", datum(l.Registratiedatum) ?? ""].join("|"), l);
  if (uniek.size > 1) return { resultaat: leeg("meerdere", nu) };
  const l = [...uniek.values()][0]!;
  return {
    resultaat: {
      status: "gevonden",
      energieklasse: l.Energieklasse?.trim().toUpperCase() || null,
      registratiedatum: datum(l.Registratiedatum),
      geldigTot: datum(l.Geldig_tot),
      opgehaaldOp: nu,
      opnamedatum: datum(l.Opnamedatum),
      energieIndex: getal(l.EnergieIndex),
      gebouwtype: l.Gebouwtype?.trim().slice(0, 100) || null,
    },
  };
}

/** Wachttijd tussen twee aanvragen bij een limiet per seconde (nooit sneller dan 10 per seconde) */
export const wachtMs = (perSeconde: number) =>
  Math.ceil(1000 / Math.min(10, Math.max(0.1, perSeconde)));

/** Melding bij een gestopt ophalen (eigen tekst, nooit de melding van EP-Online) */
export function stopMelding(f: StopFout | "geen_verbinding"): string {
  switch (f) {
    case "te_veel_verzoeken":
      return "EP-Online geeft aan dat er te veel verzoeken zijn. Het ophalen is gestopt; probeer het over een paar minuten opnieuw (Hervatten).";
    case "sleutel_ontbreekt":
      return "De EP-Online-sleutel is niet ingesteld op de server (EP_ONLINE_API_KEY).";
    case "sleutel_ongeldig":
      return "EP-Online accepteert de sleutel niet. Controleer EP_ONLINE_API_KEY.";
    case "geen_verbinding":
      return "Het ophalen is gestopt: de server gaf geen antwoord of opslaan lukte niet. Probeer het opnieuw (Hervatten).";
    default:
      return "EP-Online is nu niet bereikbaar. Het ophalen is gestopt; probeer het later opnieuw (Hervatten).";
  }
}
