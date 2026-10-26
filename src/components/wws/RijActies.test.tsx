import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { kiesInMenu, menuKeuzes, openMenu, sluitMenu } from "@/test/menu";
import { RijActies } from "./RijActies";

describe("RijActies", () => {
  it("vaste knoppen zichtbaar, de rest in het menu; verwijderen onderaan, apart", async () => {
    const weg = vi.fn();
    render(
      <RijActies
        naam="Oost"
        acties={[
          { label: "Verwijderen", gevaar: true, onSelect: weg },
          { label: "Delen", onSelect: () => {} },
          false,
          { label: "Hernoemen", onSelect: () => {} },
        ]}
      >
        <button type="button">Bekijken</button>
      </RijActies>,
    );
    expect(screen.getByRole("button", { name: "Bekijken" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Verwijderen" })).not.toBeInTheDocument();
    const knop = screen.getByRole("button", { name: "Meer acties voor Oost" });
    expect(await menuKeuzes(knop)).toEqual(["Delen", "Hernoemen", "Verwijderen"]);
    const menu = await openMenu(knop);
    expect(menu.querySelector('[role="separator"]')).not.toBeNull();
    await sluitMenu(knop);
    await kiesInMenu(knop, "Verwijderen");
    expect(weg).toHaveBeenCalledOnce();
  });

  it("zonder overige acties (kijkrol): geen menuknop", () => {
    render(
      <RijActies naam="Oost" acties={[false, null]}>
        <button type="button">PDF</button>
      </RijActies>,
    );
    expect(screen.queryByRole("button", { name: /Meer acties/ })).not.toBeInTheDocument();
  });
});
