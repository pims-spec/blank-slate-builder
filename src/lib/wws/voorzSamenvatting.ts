// Korte samenvatting van de voorzieningen van een ruimte, voor het ingeklapte paneel in de
// puntentelling (bewuste afwijking van de bron: daar is het paneel altijd uitgeklapt).
import { num } from "./basis";
import type { Fac } from "./types";

const AANRECHT: Record<string, string> = {
  "<1": "aanrecht korter dan 1 m",
  "1-2": "aanrecht 1–2 m",
  ">=2": "aanrecht 2 m of langer",
};

/** Aantal gekozen voorzieningen: een vinkje telt 1, een aantal telt zijn aantal */
function aantalVoorz(voorz: Record<string, unknown>): number {
  return Object.values(voorz).reduce<number>(
    (s, v) => s + (v === true ? 1 : Math.max(0, num(v as never) || 0)),
    0,
  );
}

const meervoud = (n: number, een: string, meer: string) => (n === 1 ? een : meer);

/** "2 wastafels", "douche", … voor de sanitaire onderdelen met een aantal > 0 */
function sanitair(s: Record<string, unknown>, delen: [string, string, string][]): string[] {
  const uit: string[] = [];
  for (const [k, een, meer] of delen) {
    const n = num(s[k] as never) || 0;
    if (n > 0) uit.push(n === 1 ? een : n + " " + meer);
  }
  return uit;
}

const SAN_DELEN: [string, string, string][] = [
  ["toiletStaand", "staand toilet", "staande toiletten"],
  ["toiletHang", "hangend toilet", "hangende toiletten"],
  ["wastafel", "wastafel", "wastafels"],
  ["meerpers", "meerpersoonswastafel", "meerpersoonswastafels"],
  ["douche", "douche", "douches"],
  ["bad", "bad", "baden"],
  ["badDouche", "bad met douche", "baden met douche"],
];

/** Bijvoorbeeld "Keuken: aanrecht 1–2 m, 5 voorzieningen" of "Badkamer: douche, wastafel, 3 extra's" */
export function samenvattingVoorz(fac: Fac): string {
  switch (fac.kind) {
    case "keuken": {
      const n = aantalVoorz(fac.keuken.voorz);
      const delen = [AANRECHT[fac.keuken.lengte] ?? "aanrecht onbekend"];
      if (n > 0) delen.push(n + " " + meervoud(n, "voorziening", "voorzieningen"));
      return "Keuken: " + delen.join(", ");
    }
    case "badkamer": {
      const delen = sanitair(fac.san as unknown as Record<string, unknown>, SAN_DELEN);
      const n = aantalVoorz(fac.san.voorz);
      if (n > 0) delen.push(n + " " + meervoud(n, "extra", "extra's"));
      return "Badkamer: " + (delen.length ? delen.join(", ") : "geen sanitair");
    }
    case "slaap_san": {
      const delen = sanitair(fac.san as unknown as Record<string, unknown>, SAN_DELEN);
      return "Sanitair: " + (delen.length ? delen.join(", ") : "geen");
    }
    case "toilet": {
      const t = fac.toilet;
      const delen = [
        t.toilet === "staand"
          ? "staand toilet"
          : t.toilet === "hangend"
            ? "hangend toilet"
            : "geen toilet",
      ];
      if (t.fontein) delen.push("fontein");
      return "Toilet: " + delen.join(", ");
    }
    case "was":
      return "Wasruimte: " + (fac.was.wastafel ? "wastafel" : "geen wastafel");
  }
}
