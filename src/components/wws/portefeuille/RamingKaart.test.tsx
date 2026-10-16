import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { maakRaming, RAMING_STANDAARD } from "@/lib/wws/portefeuille/verduurzaming";
import { RamingKaart } from "./RamingKaart";

const N = { ...RAMING_STANDAARD, ingesteld: true, perM2Laag: 100, perM2Hoog: 150 };
const bag = (oppervlakte: number | null, bouwjaar: number | null) => ({
  status: "gevonden",
  oppervlakte,
  bouwjaar,
});

describe("RamingKaart", () => {
  it("totalen naar D en C, per woning stappen en bedragen; geschat label met *", () => {
    const r = maakRaming(
      [
        { adres: "Damrak 1", klasse: "F", bag: bag(60, 1980) },
        { adres: "Damrak 2", klasse: null, bag: bag(50, 1960) },
        { adres: "Damrak 3", klasse: "G", bag: bag(null, 1960) },
      ],
      N,
    );
    render(<RamingKaart raming={r} />);
    const kaart = screen.getByRole("region", { name: "Verduurzamingsraming" });
    // F 60 m²: D 2 stappen = 12.000–18.000; G* 50 m²: D 3 stappen = 15.000–22.500
    expect(within(kaart).getByText("€ 27.000 – € 40.500")).toBeInTheDocument();
    expect(within(kaart).getByText(/Exclusief 1 woning zonder bedrag/)).toBeInTheDocument();
    expect(within(kaart).getByText("Geen oppervlakte in de BAG")).toBeInTheDocument();
    expect(within(kaart).getByTitle("Aangenomen op grond van het bouwjaar")).toBeInTheDocument();
  });

  it("zonder bedragen: melding en alleen stappen", () => {
    const r = maakRaming(
      [{ adres: "Damrak 1", klasse: "E", bag: bag(60, 1980) }],
      RAMING_STANDAARD,
    );
    render(<RamingKaart raming={r} />);
    expect(screen.getByText(/Bedragen nog niet ingesteld/)).toBeInTheDocument();
    expect(screen.queryByText(/€/)).toBeNull();
    expect(screen.getByText("1 stap")).toBeInTheDocument();
  });
});
