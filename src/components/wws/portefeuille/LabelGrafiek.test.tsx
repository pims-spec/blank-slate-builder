import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  PORTEFEUILLE_STANDAARD,
  analyseer,
  type AnalyseAdres,
} from "@/lib/wws/portefeuille/analyse";
import { normaliseerAdres } from "@/lib/wws/portefeuille/adres";
import { LabelGrafiek } from "./LabelGrafiek";

function adres(hn: number, klasse: string | null): AnalyseAdres {
  const a = normaliseerAdres({ postcode: "1053ZD", huisnummer: hn });
  if (!a.ok) throw new Error();
  return {
    ...a.adres,
    id: "a" + hn,
    resultaat: {
      status: klasse ? "gevonden" : "niet_gevonden",
      energieklasse: klasse,
      registratiedatum: klasse ? "2023-01-01" : null,
      geldigTot: null,
      opgehaaldOp: "2026-10-14T09:00:00Z",
    },
  };
}

describe("LabelGrafiek", () => {
  it("staven onder de EFG-regels en 'geen' in papaya, de rest indigo; schermlezer hoort EFG", () => {
    const u = analyseer(
      [adres(1, "A"), adres(2, "C"), adres(3, "E"), adres(4, "G"), adres(5, null)],
      "2026-10-15",
      3,
      PORTEFEUILLE_STANDAARD,
    );
    const { container } = render(<LabelGrafiek uitkomst={u} />);
    const kleurVan = (naam: RegExp) =>
      screen
        .getAllByRole("button", { name: naam })
        .map((g) => g.querySelector("path")?.getAttribute("class"))
        .filter(Boolean);
    expect(kleurVan(/^Label A:/)).toEqual(["fill-primary"]);
    expect(kleurVan(/^Label C:/)).toEqual(["fill-primary"]);
    expect(kleurVan(/^Label E, onder de EFG-regels:/)).toEqual(["fill-orange"]);
    expect(kleurVan(/^Label G, onder de EFG-regels:/)).toEqual(["fill-orange"]);
    expect(kleurVan(/^Geen label:/)).toEqual(["fill-orange"]);
    // telefoon: liggende staven met dezelfde kleuren
    const liggend = Array.from(container.querySelectorAll("ul span.block")).map((s) =>
      s.className.includes("bg-orange") ? "papaya" : "indigo",
    );
    expect(liggend).toEqual(["indigo", "indigo", "papaya", "papaya", "papaya"]);
    // geen legenda
    expect(screen.queryByText(/EFG-regels/)).not.toBeInTheDocument();
  });
});
