import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PortefeuilleLijst } from "./PortefeuilleLijst";

const namen = Array.from({ length: 12 }, (_, i) => `Portefeuille ${i + 1}`);

describe("PortefeuilleLijst", () => {
  it("vanaf 9 namen twee kolommen, behalve met kolommen={false} (archiefrij)", () => {
    const lijst = (kolommen?: boolean) => {
      const { unmount } = render(
        kolommen === undefined ? (
          <PortefeuilleLijst namen={namen} />
        ) : (
          <PortefeuilleLijst namen={namen} kolommen={kolommen} />
        ),
      );
      fireEvent.click(screen.getByRole("button", { name: "12 portefeuilles" }));
      const cls = screen.getByRole("list").className;
      expect(screen.getAllByRole("listitem")).toHaveLength(12);
      unmount();
      return cls;
    };
    expect(lijst()).toContain("sm:columns-2");
    expect(lijst(false)).not.toContain("columns-2");
  });
});
