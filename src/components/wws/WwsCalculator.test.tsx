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
});
