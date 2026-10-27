// Bewuste afwijking: welke labels in de labeltabel van het adviesrapport omcirkeld worden —
// rood het huidige label, groen het label na elke verbeteroptie. labelMarkering().
import { beginlabel } from "../advies/energieAdvies";
import { LABELS } from "../basis";
import type { Labelklasse, WwsInput } from "../types";

type Label = Exclude<Labelklasse, "EPV">;

export interface LabelMarkering {
  /** Rood: het label van de woning nu (registratie, anders het bevestigde advieslabel) */
  oud: Label | null;
  /** Groen: het label na de opties, met de optienummers (1, 2, …) die er uitkomen */
  nieuw: { label: Label; opties: number[] }[];
}

const alsLabel = (e: WwsInput["energie"] | undefined): Label | null =>
  e && (e.soort === "label" || e.soort === "labelOud") && (LABELS as string[]).includes(e.label)
    ? (e.label as Label)
    : null;

/**
 * Per optie het label na het advies: het eindlabel van de route, of het huidige label als de
 * route geen labelstap heeft. Opties met hetzelfde eindlabel worden samengevoegd.
 */
export function labelMarkering(
  cur: Pick<WwsInput, "energie" | "energieAdvies">,
  routes: {
    input?: Pick<WwsInput, "energie"> | undefined;
    stappen: { key: string; naarLabel?: string | undefined }[];
  }[],
): LabelMarkering {
  const oud = alsLabel(cur.energie) ?? beginlabel(cur).label;
  const nieuw: LabelMarkering["nieuw"] = [];
  routes.forEach((r, i) => {
    const stap = r.stappen.find((g) => g.key === "label");
    const naar = stap
      ? (alsLabel(r.input?.energie) ??
        ((LABELS as string[]).includes(stap.naarLabel ?? "") ? (stap.naarLabel as Label) : null))
      : oud;
    if (!naar) return;
    const bestaand = nieuw.find((n) => n.label === naar);
    if (bestaand) bestaand.opties.push(i + 1);
    else nieuw.push({ label: naar, opties: [i + 1] });
  });
  return { oud, nieuw };
}

/** De uitleg onder de tabel, bij de omcirkelingen (kort: één regel, ook met drie opties) */
export function labelMarkeringTekst(m: LabelMarkering): string {
  const optieTekst = (o: number[]) =>
    o.length > 1
      ? "opties " + o.slice(0, -1).join(", ") + " en " + o[o.length - 1]
      : "optie " + o[0];
  const groen = m.nieuw.map(
    (n, i) =>
      (i ? "" : "label ") +
      n.label +
      " na " +
      optieTekst(n.opties) +
      (n.label === m.oud ? " (ongewijzigd)" : ""),
  );
  return [
    m.oud ? "Rood: het huidige label " + m.oud + "." : "",
    groen.length ? "Groen: " + groen.join(", ") + "." : "",
  ]
    .filter(Boolean)
    .join(" ");
}
