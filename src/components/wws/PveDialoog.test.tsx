import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { overigType } from "@/lib/wws";
import type { Pve } from "@/lib/wws/pve";
import PveDialoog from "./PveDialoog";

const pve: Pve = {
  id: "p1",
  naam: "Standaard",
  keuken: { actief: false, keuken: { lengte: "1-2", voorz: {} } },
  indeling: { apartToilet: "nee", onbekendVeld: "blijft" },
  nieuwerVeld: 42,
};

describe("PvE-formulier: indelingswensen", () => {
  it("toont en bewaart de wensen; onbekende velden blijven in het werkexemplaar", () => {
    const onOpslaan = vi.fn();
    render(
      <PveDialoog
        open
        onOpenChange={() => {}}
        pve={pve}
        eigenaarNaam="TEST"
        bezig={false}
        onOpslaan={onOpslaan}
      />,
    );
    expect(screen.getByLabelText("Aparte toiletruimte")).toHaveValue("nee");
    expect(screen.getByLabelText("Aparte wasruimte")).toHaveValue("auto");
    const keukenKeuze = screen.getAllByLabelText("Keuken").find((el) => el.tagName === "SELECT")!;
    fireEvent.change(keukenKeuze, { target: { value: "open" } });
    fireEvent.change(screen.getByLabelText("Gewenst aantal slaapkamers (optioneel)"), {
      target: { value: "3" },
    });
    // toiletruimte staat standaard níet verwarmd; aanvinken
    const toilet = screen.getByRole("checkbox", { name: overigType("toilet").l });
    expect(toilet).not.toBeChecked();
    fireEvent.click(toilet);
    fireEvent.click(screen.getByRole("button", { name: "Opslaan" }));

    const [werk, naam] = onOpslaan.mock.calls[0]!;
    expect(naam).toBe("Standaard");
    expect(werk.indeling).toEqual({
      apartToilet: "nee",
      onbekendVeld: "blijft",
      keuken: "open",
      slaapkamers: "3",
      verwarmd: { "overig:toilet": true },
    });
    expect(werk.nieuwerVeld).toBe(42);
  });
});
