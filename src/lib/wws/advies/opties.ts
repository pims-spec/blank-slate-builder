// Adviesopties zoals in de GoHome-adviesrapporten (bewuste afwijking van de bron, die twee opties
// maakte: 187 punten en 187 + marge). Vaste doelen, elk voortbouwend op de vorige optie:
// - "middenhuur": precies de grens van de middenhuur (186), alleen als de woning eronder zit en de
//   route er ook echt op uitkomt (schiet de route erover, dan dekt de volgende optie dat);
// - "klein": een kleine marge in de vrije sector (standaard 188);
// - "ruim": een ruime marge (standaard 195); niet haalbaar → "max", het hoogst haalbare.
// Elke optie krijgt een doelzin: "Om de woning …, moet …".

import { calc, normaliseer } from "../calc";
import { ADVIES_DOELEN_STANDAARD, type Normen } from "../normen";
import { berekenRoute, type AdviesOpties } from "./advies";
import type { WwsInput } from "../types";
import type { AdviesInstellingen, AdviesStap, MaatregelKey, RouteResultaat } from "./types";

export type OptieSoort = "middenhuur" | "klein" | "ruim" | "max";

export interface AdviesOptie {
  soort: OptieSoort;
  titel: string;
  doel: number;
  route: RouteResultaat;
  doelzin: string;
}

/** De puntendoelen van de opties, uit de normen (marges boven de grens van de vrije sector) */
export function adviesDoelen(N: Pick<Normen, "grensMidden" | "adviesDoelen">) {
  const marge = (k: "kleineMarge" | "ruimeMarge") => {
    const v = Number(N.adviesDoelen?.[k]);
    return Number.isFinite(v) && v >= 1 && v <= 60 ? Math.round(v) : ADVIES_DOELEN_STANDAARD[k];
  };
  return {
    middenhuur: N.grensMidden,
    klein: N.grensMidden + marge("kleineMarge"),
    ruim: N.grensMidden + marge("ruimeMarge"),
  };
}

export const OPTIE_TITEL: Record<OptieSoort, string> = {
  middenhuur: "Middenhuur optimaal",
  klein: "Kleine marge vrije sector",
  ruim: "Ruime marge vrije sector",
  max: "Maximaal haalbaar",
};

const DOEL_TEKST: Record<OptieSoort, string> = {
  middenhuur: "optimaal binnen de middenhuur te positioneren",
  klein: "met een kleine marge in de vrije sector te positioneren",
  ruim: "met een ruime marge in de vrije sector te positioneren",
  max: "zo hoog mogelijk te waarderen",
};

type Onderwerp =
  "afmelden" | "label" | "keuken" | "badkamer" | "verwarming" | "buiten" | "aanbel" | "laadpaal";

const ONDERWERP: Record<MaatregelKey, Onderwerp> = {
  afmelden: "afmelden",
  label: "label",
  indexKlasse: "label",
  aanrecht: "keuken",
  keukenExtra: "keuken",
  bad: "badkamer",
  toiletHang: "badkamer",
  toilet: "badkamer",
  wastafel: "badkamer",
  sanExtra: "badkamer",
  verwVertrek: "verwarming",
  koeling: "verwarming",
  verwOverig: "verwarming",
  balkon: "buiten",
  aanbel: "aanbel",
  laadpaal: "laadpaal",
};

/** Is de rubriek (5 keuken, 6 sanitair) na de route afgetopt? */
const afgetopt = (r: RouteResultaat, nr: number) =>
  !!r.eind.rows.find((x) => x.nr === nr)?.t.includes("(afgetopt)");

/**
 * De stappen van deze optie die niet al in de vorige optie zaten. De stappen van de vorige optie
 * komen terug met hun samengevoegde omschrijving (berekenRoute met baseOptie); die tellen als
 * bekend, net als hun losse delen.
 */
function nieuweStappen(route: RouteResultaat, vorige: RouteResultaat | undefined): AdviesStap[] {
  return route.stappen.filter((g) => {
    const v = vorige?.stappen.find((x) => x.key === g.key);
    if (!v) return true;
    const bekend = new Set([...v.delen, v.o]);
    return g.delen.some((d) => !bekend.has(d)) || g.naarLabel !== v.naarLabel;
  });
}

/** "Om de woning …, moet het energielabel worden afgemeld en de badkamer worden gemaximaliseerd." */
export function doelzin(
  soort: OptieSoort,
  route: RouteResultaat,
  vorige: RouteResultaat | undefined,
  /** Het geregistreerde label: het begin van de labelstap als er niet eerst wordt afgemeld */
  registratieLabel?: string,
): string {
  const nieuw = nieuweStappen(route, vorige);
  const onderwerpen = [...new Set(nieuw.map((g) => ONDERWERP[g.key]))];
  const afgemeld = route.stappen.some((g) => g.key === "afmelden");
  const vanLabel =
    vorige?.input.energie.label || (afgemeld ? route.vanLabel : registratieLabel || route.vanLabel);
  const delen = onderwerpen.map((o): [string, string] => {
    switch (o) {
      case "afmelden":
        return ["het energielabel", "afgemeld"];
      case "label": {
        const naar = route.input.energie.label;
        return [
          "het energielabel",
          "verbeterd" +
            (vanLabel && naar && vanLabel !== naar ? ` (van ${vanLabel} naar ${naar})` : ""),
        ];
      }
      case "keuken":
        return ["de keuken", afgetopt(route, 5) ? "gemaximaliseerd" : "uitgebreid"];
      case "badkamer":
        return ["de badkamer", afgetopt(route, 6) ? "gemaximaliseerd" : "uitgebreid"];
      case "verwarming":
        return ["de verwarming of koeling", "uitgebreid"];
      case "buiten":
        return ["een buitenruimte", "toegevoegd"];
      case "aanbel":
        return ["een aanbelfunctie met video en audio", "aangebracht"];
      case "laadpaal":
        return ["een laadpaal", "geplaatst"];
    }
  });
  const begin = "Om de woning " + DOEL_TEKST[soort];
  if (!delen.length) return begin + ", zijn geen extra maatregelen nodig.";
  // het energielabel twee keer (afmelden en verbeteren): samen in één deel
  const samen: [string, string][] = [];
  for (const [wat, hoe] of delen) {
    const zelfde = samen.find((d) => d[0] === wat);
    if (zelfde) zelfde[1] += " en " + hoe;
    else samen.push([wat, hoe]);
  }
  const zinnen = samen.map(([wat, hoe]) => wat + " worden " + hoe);
  const lijst =
    zinnen.length === 1
      ? zinnen[0]!
      : zinnen.slice(0, -1).join(", ") + " en " + zinnen[zinnen.length - 1]!;
  return begin + ", moet " + lijst + ".";
}

/**
 * De opties voor het adviesrapport: middenhuur optimaal (als de woning eronder zit), kleine marge,
 * ruime marge of het hoogst haalbare. Elke optie bouwt voort op de vorige. Leeg: de woning zit al
 * op of boven de ruime marge.
 */
export function adviesOpties(
  input: WwsInput,
  N: Normen,
  inst: AdviesInstellingen,
  opties: AdviesOpties = {},
): AdviesOptie[] {
  const D = adviesDoelen(N);
  // labelstappen tellen in de opties nooit als lastig (zoals de adviesrapporten)
  const ro: AdviesOpties = { ...opties, labelNietLastig: true };
  const begin = normaliseer(input);
  const start = calc(begin, N).totaal;
  const regLabel =
    begin.energie.soort === "label" || begin.energie.soort === "labelOud"
      ? begin.energie.label
      : "";
  const uit: AdviesOptie[] = [];
  let vorige: RouteResultaat | undefined;
  const voeg = (soort: OptieSoort, doel: number, route: RouteResultaat) => {
    uit.push({
      soort,
      titel: OPTIE_TITEL[soort],
      doel,
      route,
      doelzin: doelzin(soort, route, vorige, regLabel),
    });
    vorige = route;
  };
  const hoogste = () => vorige?.eind.totaal ?? start;

  if (start < D.middenhuur) {
    const r = berekenRoute(input, N, inst, D.middenhuur, undefined, ro);
    if (r.gehaald && r.eind.totaal === D.middenhuur) voeg("middenhuur", D.middenhuur, r);
  }
  for (const soort of ["klein", "ruim"] as const) {
    const doel = D[soort];
    if (hoogste() >= doel) continue;
    const r = berekenRoute(input, N, inst, doel, vorige, ro);
    if (r.gehaald) {
      voeg(soort, doel, r);
      continue;
    }
    // niet haalbaar: het hoogst haalbare, als dat meer is dan wat er al is
    const max = berekenRoute(input, N, inst, 9999, vorige, ro);
    if (max.eind.totaal > hoogste())
      voeg("max", max.eind.totaal, { ...max, doel: max.eind.totaal });
    break;
  }
  return uit;
}
