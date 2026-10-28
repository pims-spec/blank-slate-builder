import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { legeInput, type PlatVerdieping } from "@/lib/wws";
import VerdiepingenBalk from "./VerdiepingenBalk";

const v = (naam: string, y: number): PlatVerdieping => ({ naam, x: 0, y, w: 100, h: 100 });
const twee = [v("Begane grond", 56), v("1e verdieping", 212)];
const input = () => {
  const i = legeInput();
  i.vertrekken = [
    {
      type: "slaapkamer",
      naam: "Slaapkamer (1e verdieping)",
      m2: 12,
      verwarmd: true,
      verdieping: "1e verdieping",
    },
    {
      type: "woonkamer",
      naam: "Woonkamer (Begane grond)",
      m2: 30,
      verwarmd: true,
      verdieping: "Begane grond",
    },
  ];
  i.overig = [
    {
      type: "overloop",
      naam: "Overloop (1e verdieping)",
      m2: 3,
      verwarmd: true,
      verdieping: "1e verdieping",
    },
  ];
  return i;
};

describe("VerdiepingenBalk", () => {
  it("één verdieping of minder: niets", () => {
    const { container } = render(<VerdiepingenBalk input={input()} verdiepingen={[twee[0]!]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("alleen-lezen: de verdiepingen zonder ✕", () => {
    render(<VerdiepingenBalk input={input()} verdiepingen={twee} />);
    expect(screen.getByText("1e verdieping")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Verdieping verwijderen/ })).toBeNull();
  });

  it("✕ vraagt bevestiging; het vinkje voor de ruimten staat aan en telt de ruimten", () => {
    const onVerwijder = vi.fn();
    render(<VerdiepingenBalk input={input()} verdiepingen={twee} onVerwijder={onVerwijder} />);
    fireEvent.click(screen.getByRole("button", { name: "Verdieping verwijderen: 1e verdieping" }));
    expect(screen.getByText("1e verdieping verwijderen?")).toBeInTheDocument();
    const vink = screen.getByRole("checkbox", {
      name: "Ook de 2 ruimten van deze verdieping uit de telling halen",
    });
    expect(vink).toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: "Verwijderen" }));
    expect(onVerwijder).toHaveBeenCalledWith(1, true);
  });

  it("vinkje uit: alleen de tekening; annuleren doet niets", () => {
    const onVerwijder = vi.fn();
    render(<VerdiepingenBalk input={input()} verdiepingen={twee} onVerwijder={onVerwijder} />);
    fireEvent.click(screen.getByRole("button", { name: "Verdieping verwijderen: Begane grond" }));
    fireEvent.click(screen.getByRole("button", { name: "Annuleren" }));
    expect(onVerwijder).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Verdieping verwijderen: Begane grond" }));
    fireEvent.click(screen.getByRole("checkbox", { name: /Ook de ruimte van deze verdieping/ }));
    fireEvent.click(screen.getByRole("button", { name: "Verwijderen" }));
    expect(onVerwijder).toHaveBeenCalledWith(0, false);
  });
});
