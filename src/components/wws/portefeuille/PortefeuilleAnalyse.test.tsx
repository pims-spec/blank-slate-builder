import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { rechtenVan, type AppRole } from "@/lib/rollen";
import type { AnalyseAdres } from "@/lib/wws/portefeuille/analyse";
import PortefeuilleAnalyse from "./PortefeuilleAnalyse";

const store = vi.hoisted(() => ({
  lijst: vi.fn(),
  adressen: vi.fn(),
  analyses: vi.fn(),
  slaResultatenOp: vi.fn(),
  slaAnalyseOp: vi.fn(),
  maak: vi.fn(),
  voegAdressenToe: vi.fn(),
  verwijder: vi.fn(),
  verwijderAnalyse: vi.fn(),
  bewerk: vi.fn(),
}));
vi.mock("../tellingStore", () => ({
  portefeuilleStore: store,
  portefeuillesQuery: () => ({ queryKey: ["portefeuilles"], queryFn: () => store.lijst() }),
  portefeuilleAdressenQuery: (id: string) => ({
    queryKey: ["portefeuille-adressen", id],
    queryFn: () => store.adressen(id),
  }),
  portefeuilleAnalysesQuery: (id: string) => ({
    queryKey: ["portefeuille-analyses", id],
    queryFn: () => store.analyses(id),
  }),
  klantenQuery: () => ({
    queryKey: ["klanten"],
    queryFn: async () => [{ id: "k1", naam: "Amstel Wonen", pve: [] }],
  }),
}));
const haalLabelsOp = vi.hoisted(() => vi.fn());
vi.mock("@/lib/wws/portefeuille/portefeuille.functions", () => ({
  MAX_PER_PORTIE: 10,
  haalLabelsOp,
}));
const bewaar = vi.hoisted(() => vi.fn());
vi.mock("@/lib/wws/pdf/laden", async (orig) => ({
  ...(await orig<typeof import("@/lib/wws/pdf/laden")>()),
  bewaarBestand: bewaar,
}));

const adressen: AnalyseAdres[] = Array.from({ length: 12 }, (_, i) => ({
  id: "00000000-0000-4000-8000-0000000000" + String(i + 10),
  postcode: "1053ZD",
  huisnummer: i + 1,
  huisletter: "",
  toevoeging: "",
  resultaat:
    i === 0
      ? {
          status: "gevonden",
          energieklasse: "F",
          registratiedatum: "2019-05-05",
          geldigTot: null,
          opgehaaldOp: "2026-10-14T09:00:00Z",
        }
      : null,
}));

function toon(roles: AppRole[], userId = "u1") {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <PortefeuilleAnalyse rechten={rechtenVan(roles)} userId={userId} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  store.lijst.mockResolvedValue([
    {
      id: "p1",
      naam: "TEST Oost",
      klantId: null,
      bron: "import",
      createdBy: "u1",
      createdAt: "",
      aantalAdressen: 12,
    },
  ]);
  store.adressen.mockResolvedValue(adressen);
  store.analyses.mockResolvedValue([]);
  store.slaResultatenOp.mockResolvedValue(undefined);
});

describe("Portefeuille-analyse", () => {
  it("schrijver: ophalen in porties van 10, opslaan per portie; stopt als EP-Online stopt", async () => {
    haalLabelsOp
      .mockImplementationOnce(async ({ data }: { data: { adressen: { id: string }[] } }) => ({
        resultaten: data.adressen.map((a) => ({
          id: a.id,
          resultaat: { status: "niet_gevonden" },
        })),
      }))
      .mockImplementationOnce(async () => ({ resultaten: [], stop: "te_veel_verzoeken" }));
    toon(["member"]);
    const knop = await screen.findByRole("button", { name: "Hervatten (11)" });
    fireEvent.click(knop);
    await waitFor(() => expect(haalLabelsOp).toHaveBeenCalledTimes(2));
    expect(haalLabelsOp.mock.calls[0]![0].data.adressen).toHaveLength(10);
    expect(haalLabelsOp.mock.calls[1]![0].data.adressen).toHaveLength(1);
    expect(haalLabelsOp.mock.calls[0]![0].data.adressen[0]).toEqual({
      id: adressen[1]!.id,
      postcode: "1053ZD",
      huisnummer: 2,
      huisletter: "",
      toevoeging: "",
    });
    expect(store.slaResultatenOp.mock.calls[0]![0]).toBe("p1");
    expect(store.slaResultatenOp.mock.calls[0]![1]).toBe("u1");
    expect(await screen.findByRole("alert")).toHaveTextContent(/te veel verzoeken/);
  });

  it("toont de analyse en slaat hem op; PDF te downloaden", async () => {
    store.slaAnalyseOp.mockResolvedValue("an1");
    toon(["member"]);
    const efg = await screen.findByRole("region", { name: "EFG-regels" });
    expect(within(efg).getByText(/Woningen met label E, F of G/)).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Risicoprofiel" })).toBeInTheDocument();
    expect(screen.getByText(/Nog niet opgehaald \(11\)/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Analyse opslaan" }));
    await waitFor(() => expect(store.slaAnalyseOp).toHaveBeenCalledTimes(1));
    expect(store.slaAnalyseOp.mock.calls[0]![1]).toMatchObject({
      vensterMaanden: 3,
      aantalAdressen: 12,
      aantalBeoordeeld: 1,
    });
    fireEvent.click(screen.getByRole("button", { name: "PDF" }));
    await waitFor(() => expect(bewaar).toHaveBeenCalledTimes(1));
    expect(bewaar.mock.calls[0]![0]).toMatch(
      /^Portefeuille-analyse_TEST_Oost_\d{4}-\d{2}-\d{2}\.pdf$/,
    );
  });

  it("kijkrol: bekijken en PDF, niets ophalen, importeren, opslaan of verwijderen", async () => {
    toon(["viewer"], "lezer");
    expect(await screen.findByRole("region", { name: "EFG-regels" })).toBeInTheDocument();
    for (const naam of [
      /Ophalen|Hervatten/,
      /Opnieuw ophalen/,
      "Portefeuille importeren",
      "Adressen toevoegen",
      "Analyse opslaan",
      "Portefeuille verwijderen",
    ])
      expect(screen.queryByRole("button", { name: naam })).toBeNull();
    expect(screen.getByRole("button", { name: "PDF" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Eigenaar: geen" })).toBeDisabled();
  });

  it("eigenaar in GoHome koppelen aan een bestaande portefeuille", async () => {
    store.bewerk.mockResolvedValue(undefined);
    toon(["member"]);
    fireEvent.click(await screen.findByRole("button", { name: "Eigenaar: geen" }));
    fireEvent.click(await screen.findByRole("option", { name: "Amstel Wonen" }));
    await waitFor(() => expect(store.bewerk).toHaveBeenCalledWith("p1", { klantId: "k1" }));
  });

  it("verwijderen alleen voor de maker of een admin", async () => {
    toon(["member"], "iemand-anders");
    await screen.findByRole("region", { name: "EFG-regels" });
    expect(screen.queryByRole("button", { name: "Portefeuille verwijderen" })).toBeNull();
  });
});
