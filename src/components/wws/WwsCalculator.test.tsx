import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import WwsCalculator from "./WwsCalculator";

describe("WwsCalculator", () => {
  it("rekent live mee als er een vertrek wordt toegevoegd", () => {
    render(<WwsCalculator />);
    expect(screen.getByText("Sociale huur")).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole("button", { name: "Vertrek toevoegen" })[0]!);
    fireEvent.change(screen.getAllByPlaceholderText("0,00")[0]!, { target: { value: "40" } });

    expect(screen.getByText("40 m² × 1")).toBeInTheDocument();
  });

  it("lengte × breedte: oppervlak volgt, minteken trekt af, maat toevoegen en verwijderen", () => {
    render(<WwsCalculator />);
    fireEvent.click(screen.getAllByRole("button", { name: "Vertrek toevoegen" })[0]!);
    const m2 = () => screen.getByTitle("Berekend uit lengte × breedte");
    fireEvent.change(screen.getByLabelText("Lengte in meter (Slaapkamer, maat 1)"), {
      target: { value: "5" },
    });
    fireEvent.change(screen.getByLabelText("Breedte in meter (Slaapkamer, maat 1)"), {
      target: { value: "4,5" },
    });
    expect(m2()).toHaveValue("22,5");
    fireEvent.click(screen.getByRole("button", { name: "+ lengte × breedte" }));
    fireEvent.change(screen.getByLabelText("Lengte in meter (Slaapkamer, maat 2)"), {
      target: { value: "-0,3" },
    });
    fireEvent.change(screen.getByLabelText("Breedte in meter (Slaapkamer, maat 2)"), {
      target: { value: "0,6" },
    });
    expect(m2()).toHaveValue("22,32");
    fireEvent.click(screen.getByRole("button", { name: "Maat 2 verwijderen (Slaapkamer)" }));
    expect(m2()).toHaveValue("22,5");
  });

  it("opmerking onder een verkeersruimte en een te kleine ruimte", () => {
    render(<WwsCalculator />);
    fireEvent.click(screen.getByRole("button", { name: "Ruimte toevoegen" }));
    expect(screen.queryByText(/Kleiner dan 2 m²/)).toBeNull();
    const m2 = screen.getAllByPlaceholderText("0,00")[0]!;
    fireEvent.change(m2, { target: { value: "1,5" } });
    expect(screen.getByText("Kleiner dan 2 m²: geen oppervlaktepunten.")).toBeInTheDocument();
  });
});
