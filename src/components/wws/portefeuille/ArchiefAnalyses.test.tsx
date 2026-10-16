import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { rechtenVan, type AppRole } from "@/lib/rollen";
import { PORTEFEUILLE_STANDAARD, analyseer } from "@/lib/wws/portefeuille/analyse";
import type { ArchiefAnalyse } from "@/lib/wws/portefeuille/opslag";
import { ArchiefAnalyses } from "./ArchiefAnalyses";

const store = vi.hoisted(() => ({
  archiefAnalyses: vi.fn(),
  analyseUitkomst: vi.fn(),
  verwijderAnalyse: vi.fn(),
  verwijderCombiAnalyse: vi.fn(),
}));
vi.mock("../tellingStore", () => ({
  portefeuilleStore: store,
  archiefAnalysesQuery: () => ({
    queryKey: ["archief-analyses"],
    queryFn: () => store.archiefAnalyses(),
  }),
  klantenQuery: () => ({
    queryKey: ["klanten"],
    queryFn: async () => [{ id: "k1", naam: "Amstel Wonen", pve: [] }],
  }),
  portefeuillesQuery: () => ({
    queryKey: ["portefeuilles"],
    queryFn: async () => [
      { id: "p1", naam: "Oost", createdBy: "u1" },
      { id: "p2", naam: "West", createdBy: "u2" },
    ],
  }),
  delenStore: {
    collegas: async () => [
      { id: "u2", naam: "Bas", email: "bas@x.nl" },
      { id: "u3", naam: "Cor", email: "cor@x.nl" },
    ],
    portefeuilleGedeeldMet: async () => [],
    deelPortefeuille: async () => {},
    ontdeelPortefeuille: async () => {},
  },
}));
const bewaar = vi.hoisted(() => vi.fn());
vi.mock("@/lib/wws/pdf/laden", async (orig) => ({
  ...(await orig<typeof import("@/lib/wws/pdf/laden")>()),
  bewaarBestand: bewaar,
}));

const rij = (x: Partial<ArchiefAnalyse>): ArchiefAnalyse => ({
  soort: "portefeuille",
  id: "a1",
  titel: "Oost",
  portefeuilleIds: ["p1"],
  portefeuilleNamen: ["Oost"],
  klantIds: ["k1"],
  analyseDatum: "2026-10-16",
  vensterMaanden: 3,
  aantalAdressen: 12,
  gemaaktOp: "2026-10-16T10:00:00Z",
  gemaaktDoor: "u1",
  gemaaktDoorNaam: "Anna",
  ...x,
});

function toon(rollen: AppRole[], userId = "u1") {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ArchiefAnalyses rechten={rechtenVan(rollen)} userId={userId} tabs={null} />
    </QueryClientProvider>,
  );
}

describe("Archief: portefeuille-analyses", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    store.archiefAnalyses.mockResolvedValue([
      rij({}),
      rij({
        soort: "combi",
        id: "c1",
        titel: "Oost en West",
        portefeuilleIds: ["p1", "p2"],
        portefeuilleNamen: ["Oost", "West"],
        gemaaktDoor: "u2",
        gemaaktDoorNaam: "Bas",
      }),
    ]);
    store.analyseUitkomst.mockResolvedValue(analyseer([], "2026-10-16", 3, PORTEFEUILLE_STANDAARD));
  });

  it("toont enkele en gecombineerde analyses met eigenaar en maker; zoeken", async () => {
    toon(["member"]);
    const tabel = await screen.findByRole("table", { name: "Portefeuille-analyses" });
    expect(within(tabel).getAllByText("Amstel Wonen")).toHaveLength(2);
    expect(within(tabel).getByText("Gecombineerd")).toBeInTheDocument();
    expect(within(tabel).getByText("Oost, West")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Zoeken in portefeuille-analyses"), {
      target: { value: "bas" },
    });
    expect(within(tabel).queryByText("Anna")).not.toBeInTheDocument();
    expect(within(tabel).getByText("Bas")).toBeInTheDocument();
  });

  it("verwijderen alleen voor de maker (of admin); kijkrol alleen bekijken en PDF", async () => {
    const { unmount } = toon(["member"], "u1");
    await screen.findByRole("table", { name: "Portefeuille-analyses" });
    expect(screen.getAllByRole("button", { name: "Verwijderen" })).toHaveLength(1);
    unmount();
    toon(["viewer"], "u1");
    await screen.findByRole("table", { name: "Portefeuille-analyses" });
    expect(screen.queryByRole("button", { name: "Verwijderen" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Bekijken" })).toHaveLength(2);
    expect(screen.getAllByRole("button", { name: "PDF" })).toHaveLength(2);
  });

  it("bekijken laadt de uitkomst; PDF van een gecombineerde analyse", async () => {
    toon(["admin"], "u9");
    await screen.findByRole("table", { name: "Portefeuille-analyses" });
    fireEvent.click(screen.getAllByRole("button", { name: "Bekijken" })[1]!);
    const dialoog = await screen.findByRole("dialog");
    expect(store.analyseUitkomst).toHaveBeenCalledWith("combi", "c1");
    expect(within(dialoog).getByText("Gecombineerd: Oost, West")).toBeInTheDocument();
    fireEvent.click(within(dialoog).getByRole("button", { name: "PDF" }));
    await waitFor(() => expect(bewaar).toHaveBeenCalled());
    expect(bewaar.mock.calls[0]![0]).toBe("Portefeuille-analyse_Oost_en_West_2026-10-16.pdf");
  });

  it("verwijderen: juiste soort", async () => {
    store.verwijderCombiAnalyse.mockResolvedValue(undefined);
    toon(["admin"], "u9");
    await screen.findByRole("table", { name: "Portefeuille-analyses" });
    fireEvent.click(screen.getAllByRole("button", { name: "Verwijderen" })[1]!);
    fireEvent.click(await screen.findByRole("button", { name: "Verwijderen", hidden: false }));
    await waitFor(() => expect(store.verwijderCombiAnalyse).toHaveBeenCalledWith("c1"));
    expect(store.verwijderAnalyse).not.toHaveBeenCalled();
  });

  it("delen: alleen portefeuilles die jij maakte; bij gecombineerd alleen die", async () => {
    toon(["member"], "u1");
    await screen.findByRole("table", { name: "Portefeuille-analyses" });
    await waitFor(() => expect(screen.getAllByRole("button", { name: "Delen" })).toHaveLength(2));
    fireEvent.click(screen.getAllByRole("button", { name: "Delen" })[1]!);
    const d = await screen.findByRole("dialog");
    expect(within(d).getByText("Portefeuille delen")).toBeInTheDocument();
    // gecombineerd Oost + West, maar u1 maakte alleen Oost: geen keuzelijst
    expect(within(d).queryByRole("combobox")).not.toBeInTheDocument();
    expect(await within(d).findByText("Bas")).toBeInTheDocument();
  });

  it("kijkrol: geen delen", async () => {
    toon(["viewer"], "u1");
    await screen.findByRole("table", { name: "Portefeuille-analyses" });
    expect(screen.queryByRole("button", { name: "Delen" })).not.toBeInTheDocument();
  });
});
