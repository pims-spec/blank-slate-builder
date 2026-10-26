import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { normaliseerAdres } from "@/lib/wws/portefeuille/adres";
import {
  PORTEFEUILLE_STANDAARD,
  analyseer,
  type AnalyseAdres,
} from "@/lib/wws/portefeuille/analyse";
import { AnalyseWeergave } from "./AnalyseWeergave";
import { vergeetPdfKeuzes, zetInPdf } from "./pdfKeuzes";

function adres(hn: number, klasse: string | null, reg: string | null): AnalyseAdres {
  const a = normaliseerAdres({ postcode: "1053ZD", huisnummer: hn });
  if (!a.ok) throw new Error();
  return {
    ...a.adres,
    id: "a" + hn,
    resultaat: {
      status: klasse ? "gevonden" : "niet_gevonden",
      energieklasse: klasse,
      registratiedatum: reg,
      geldigTot: null,
      opgehaaldOp: "2026-10-14T09:00:00Z",
    },
  };
}

const u = analyseer(
  [adres(1, "C", "2016-11-20"), adres(2, "C", "2023-01-01"), adres(3, null, null)],
  "2026-10-16",
  3,
  PORTEFEUILLE_STANDAARD,
);

describe("doorklikken in de analyse", () => {
  it("staaf: popup met de adressen van die klasse", () => {
    render(<AnalyseWeergave uitkomst={u} />);
    // de grafiek staat er twee keer (scherm en telefoon); de eerste knop volstaat
    fireEvent.click(screen.getAllByRole("button", { name: /^Label C: 2 woningen/ })[0]!);
    const d = screen.getByRole("dialog");
    expect(within(d).getByText("Label C")).toBeInTheDocument();
    const rijen = within(d).getAllByRole("row").slice(1);
    expect(rijen.map((r) => r.textContent)).toEqual([
      "1053 ZD 1C20-11-201620-11-2026",
      "1053 ZD 2C01-01-202301-01-2033",
    ]);
  });

  it("risicoprofiel: popup met de adressen van die categorie", () => {
    render(<AnalyseWeergave uitkomst={u} />);
    fireEvent.click(screen.getByRole("button", { name: "Geen geregistreerd label" }));
    const d = screen.getByRole("dialog");
    expect(within(d).getByText("1 woning")).toBeInTheDocument();
    expect(within(d).getByText("1053 ZD 3")).toBeInTheDocument();
  });

  it("oude opgeslagen analyse zonder lijsten: uitleg in plaats van een lege lijst", () => {
    const oud = {
      ...u,
      perKlasse: u.perKlasse.map(({ adressen: _a, ...k }) => k),
      risico: u.risico.map(({ adressen: _a, ...r }) => r),
    };
    render(<AnalyseWeergave uitkomst={oud} />);
    fireEvent.click(screen.getByRole("button", { name: "Geen geregistreerd label" }));
    expect(screen.getByText(/lijst met adressen niet bewaard/)).toBeInTheDocument();
  });
});

describe("kleuren in de grafiek", () => {
  afterEach(() => {
    localStorage.clear();
    vergeetPdfKeuzes();
  });

  it("volgen de vink 'EFG-regels in de PDF'", () => {
    const efg = analyseer([adres(1, "F", "2023-01-01")], "2026-10-16", 3, PORTEFEUILLE_STANDAARD);
    render(<AnalyseWeergave uitkomst={efg} />);
    const fKleur = () =>
      screen
        .getAllByRole("button", { name: /^Label F/ })
        .map((g) => g.querySelector("path")?.getAttribute("class"))
        .filter(Boolean);
    expect(fKleur()).toEqual(["fill-orange"]);
    act(() => zetInPdf("efg", false));
    expect(fKleur()).toEqual(["fill-primary"]);
  });
});
