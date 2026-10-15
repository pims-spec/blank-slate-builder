import { render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { HomeHero, HomeStats } from "./HomeStart";

vi.mock("./tellingStore", () => ({
  tellingenQuery: () => ({
    queryKey: ["tellingen"],
    queryFn: async () => [
      { id: "a", ownerId: "u1" },
      { id: "b", ownerId: "u1" },
      { id: "c", ownerId: "u2" },
    ],
  }),
  dashboardVersiesQuery: () => ({
    queryKey: ["dashboard-versies"],
    queryFn: async () => ({
      versies: [
        { tellingId: "a", nr: 1, resultaat: { totaal: 170, maxHuur: 1100 } },
        { tellingId: "a", nr: 2, resultaat: { totaal: 188, maxHuur: 1240.5 } },
        { tellingId: "c", nr: 1, resultaat: { totaal: 100, maxHuur: 600 } },
        { tellingId: "c", nr: 2, resultaat: { totaal: 150, maxHuur: 900 } },
      ],
      limietBereikt: false,
    }),
  }),
}));

describe("startscherm", () => {
  it("homehero met groet en tagline", () => {
    render(<HomeHero naam="Pim" />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      /^Goede(nacht|morgen|middag|navond), Pim$/,
    );
    expect(screen.getByText("Wat wil je doen?")).toBeInTheDocument();
  });

  it("statistieken van de eigen tellingen (niet die van een collega)", async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <HomeStats userId="u1" />
      </QueryClientProvider>,
    );
    const kaart = await screen.findByRole("region", { name: "Jouw statistieken" });
    const tegel = (label: string) => within(kaart).getByText(label).parentElement!.textContent;
    expect(tegel("Gemaakte tellingen")).toBe("2Gemaakte tellingen");
    expect(tegel("Gemaakte adviezen")).toMatch(/^1Gemaakte adviezen/);
    expect(tegel("Punten in totaal verhoogd")).toBe("+18Punten in totaal verhoogd");
    expect(
      within(kaart).getByRole("button", { name: "Uitleg: Gemaakte adviezen" }),
    ).toBeInTheDocument();
  });
});
