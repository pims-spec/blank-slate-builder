import { fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { rechtenVan, type AppRole } from "@/lib/rollen";
import { DEFAULT_NORMEN, type Normen } from "@/lib/wws";
import { maakTellingDoc, nieuweTellingStaat, type Telling } from "@/lib/wws/opslag";
import Portefeuille from "./Portefeuille";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: ReactNode }) => <a>{children}</a>,
}));

const bron = vi.hoisted(() => ({
  tellingen: vi.fn(),
  versies: vi.fn(),
  klanten: vi.fn(),
}));
vi.mock("./tellingStore", () => ({
  tellingenQuery: () => ({ queryKey: ["tellingen"], queryFn: () => bron.tellingen() }),
  dashboardVersiesQuery: () => ({ queryKey: ["dv"], queryFn: () => bron.versies() }),
  klantenQuery: () => ({ queryKey: ["klanten"], queryFn: () => bron.klanten() }),
}));

const N = DEFAULT_NORMEN as unknown as Normen;

function telling(
  id: string,
  ownerId: string,
  ownerNaam: string,
  m2: number,
  klantId = "",
): Telling {
  const s = nieuweTellingStaat("x");
  s.meta = { ...s.meta, naam: "Telling " + id, klantId };
  s.input.vertrekken.push({ type: "woonkamer", m2, verwarmd: true });
  return {
    ...maakTellingDoc(s, N, null),
    id,
    ownerId,
    ownerNaam,
    gewijzigdOp: "2026-10-14T10:00:00Z",
  };
}

function toon(roles: AppRole[]) {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <Portefeuille rechten={rechtenVan(roles)} />
    </QueryClientProvider>,
  );
}

const tegel = (label: RegExp) => screen.getByText(label).parentElement!;

beforeEach(() => {
  vi.clearAllMocks();
  bron.tellingen.mockResolvedValue([
    telling("1", "u1", "Anna", 30, "k1"),
    telling("2", "u2", "Bob", 40),
    telling("3", "u2", "Bob", 50),
  ]);
  bron.versies.mockResolvedValue({ versies: [], limietBereikt: false });
  bron.klanten.mockResolvedValue([{ id: "k1", naam: "Amstel Wonen", pves: [] }]);
});

describe("Dashboard", () => {
  it("admin: tegels, werkverdeling per collega; filter op eigenaar", async () => {
    toon(["admin", "member"]);
    expect(await screen.findByText("Tellingen in de portefeuille")).toBeInTheDocument();
    expect(within(tegel(/Tellingen in de portefeuille/)).getByText("3")).toBeInTheDocument();
    const werk = screen.getByRole("region", { name: "Werkverdeling per collega" });
    expect(within(werk).getByText("Bob")).toBeInTheDocument();
    expect(within(werk).getByText(/2 tellingen/)).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();

    await screen.findByRole("option", { name: "Amstel Wonen" });
    fireEvent.change(screen.getByLabelText("Eigenaar"), { target: { value: "k1" } });
    expect(within(tegel(/Tellingen in de portefeuille/)).getByText("1")).toBeInTheDocument();
  });

  it("kijkrol: geen werkverdeling per collega", async () => {
    toon(["viewer"]);
    await screen.findByText("Tellingen in de portefeuille");
    expect(screen.queryByRole("region", { name: "Werkverdeling per collega" })).toBeNull();
  });

  it("limiet van 5000 versies bereikt: duidelijke melding", async () => {
    bron.versies.mockResolvedValue({ versies: [], limietBereikt: true });
    toon(["admin", "member"]);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Let op: er zijn meer dan 5.000 opgeslagen versies",
    );
  });
});
