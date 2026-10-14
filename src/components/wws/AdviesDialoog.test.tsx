import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DEFAULT_NORMEN, calc, legeInput, type Normen, type WwsInput } from "@/lib/wws";
import { berekenAdvies, standaardInstellingen } from "@/lib/wws/advies";
import AdviesDialoog from "./AdviesDialoog";

vi.mock("./tellingStore", async () => {
  const { DEFAULT_NORMEN } = await import("@/lib/wws");
  return { NORMEN: DEFAULT_NORMEN, tellingStore: {} };
});

const N = DEFAULT_NORMEN as unknown as Normen;

function woning(): WwsInput {
  const x = legeInput();
  x.vertrekken.push(
    { type: "woonkamer", m2: 30, verwarmd: true },
    { type: "keuken", m2: 8, verwarmd: true },
    { type: "slaapkamer", m2: 12, verwarmd: false },
    { type: "badkamer", m2: 5, verwarmd: true },
  );
  x.energie = { soort: "label", label: "E", indexKlasse: "", datum: "2024-01-01", bouwjaar: "" };
  x.woz.waarde = 350000;
  return x;
}

const kpi = (titel: string) => screen.getByText(titel).parentElement!;

describe("AdviesDialoog", () => {
  it("toont de route; uitvinken rekent mee; toepassen geeft de nieuwe invoer door", () => {
    const x = woning();
    const A = berekenAdvies(x, N, standaardInstellingen(N));
    const onToepassen = vi.fn();
    render(<AdviesDialoog open onOpenChange={() => {}} input={x} onToepassen={onToepassen} />);

    expect(within(kpi("Nu")).getByText(String(calc(x, N).totaal))).toBeInTheDocument();
    expect(within(kpi("Met selectie")).getByText(String(A.eind.totaal))).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: `Route (${A.stappen.length})` })).toBeInTheDocument();

    // stap 1 uitvinken: minder punten met selectie, en één maatregel minder om toe te passen
    fireEvent.click(screen.getByRole("checkbox", { name: "Stap 1 toepassen" }));
    const n = A.stappen.length - 1;
    const knop = screen.getByRole("button", { name: `Toepassen op telling (${n})` });
    fireEvent.click(knop);
    expect(onToepassen).toHaveBeenCalledTimes(1);
    const [input, aantal, punten] = onToepassen.mock.calls[0]!;
    expect(aantal).toBe(n);
    expect(calc(input, N).totaal).toBe(punten);
    expect(punten).toBeLessThanOrEqual(A.eind.totaal);
    // de oorspronkelijke invoer is niet gewijzigd
    expect(x).toEqual(woning());
  });

  it("marge verhoogt het doel", () => {
    render(<AdviesDialoog open onOpenChange={() => {}} input={woning()} onToepassen={vi.fn()} />);
    const marge = screen.getByLabelText("Marge in punten");
    fireEvent.change(marge, { target: { value: "5" } });
    fireEvent.blur(marge);
    expect(within(kpi("Doel")).getByText(String(N.grensMidden + 1 + 5))).toBeInTheDocument();
  });
});
