import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import type { RapportPlattegrond } from "@/lib/wws/plattegrond/rapport";
import RapportPlattegronden from "./RapportPlattegronden";

vi.mock("./plattegrondBeeld", () => ({
  plattegrondOpslag: { haal: vi.fn(() => new Promise(() => {})), bewaar: vi.fn() },
}));

const T = "11111111-1111-4111-8111-111111111111";
const pad = (n: number) => `${T}/00000000-0000-4000-8000-${String(n).padStart(12, "0")}.jpg`;
const lijst: RapportPlattegrond[] = [
  { pad: pad(1), breedte: 10, hoogte: 10, soort: "2d" },
  { pad: pad(2), breedte: 10, hoogte: 10, soort: "eigen", titel: "Zolder" },
];

const wrap = (n: ReactNode) => (
  <QueryClientProvider client={new QueryClient()}>{n}</QueryClientProvider>
);

describe("RapportPlattegronden", () => {
  it("nieuwe telling: eerst opslaan", () => {
    render(
      wrap(
        <RapportPlattegronden
          tellingId={T}
          isNieuw
          alleenLezen={false}
          lijst={[]}
          onWijzig={() => {}}
          onVerwijderd={() => {}}
        />,
      ),
    );
    expect(
      screen.getByRole("button", { name: "Plattegrond toevoegen aan rapport" }),
    ).toBeDisabled();
    expect(screen.getByText(/Sla de telling eerst op/)).toBeInTheDocument();
  });

  it("toont de paginatitels; volgorde wijzigen en verwijderen", () => {
    const onWijzig = vi.fn();
    const onVerwijderd = vi.fn();
    render(
      wrap(
        <RapportPlattegronden
          tellingId={T}
          isNieuw={false}
          alleenLezen={false}
          lijst={lijst}
          onWijzig={onWijzig}
          onVerwijderd={onVerwijderd}
        />,
      ),
    );
    expect(screen.getByText("Plattegrond 1 - 2D")).toBeInTheDocument();
    expect(screen.getByText("Plattegrond 2 - Zolder")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Plattegrond 2 omhoog" }));
    expect(onWijzig).toHaveBeenLastCalledWith([lijst[1], lijst[0]]);
    fireEvent.click(screen.getAllByRole("button", { name: "Verwijderen" })[0]!);
    expect(onWijzig).toHaveBeenLastCalledWith([lijst[1]]);
    expect(onVerwijderd).toHaveBeenCalledWith(pad(1));
    fireEvent.change(screen.getByRole("combobox", { name: "Soort plattegrond 1" }), {
      target: { value: "situatie" },
    });
    expect(onWijzig).toHaveBeenLastCalledWith([{ ...lijst[0], soort: "situatie" }, lijst[1]]);
  });

  it("alleen lezen zonder plattegronden: niets", () => {
    const { container } = render(
      wrap(
        <RapportPlattegronden
          tellingId={T}
          isNieuw={false}
          alleenLezen
          lijst={[]}
          onWijzig={() => {}}
          onVerwijderd={() => {}}
        />,
      ),
    );
    expect(container).toBeEmptyDOMElement();
  });
});
