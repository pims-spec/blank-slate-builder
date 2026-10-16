import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { rechtenVan, type AppRole } from "@/lib/rollen";
import { PORTEFEUILLE_STANDAARD, type AnalyseAdres } from "@/lib/wws/portefeuille/analyse";
import type { Portefeuille } from "@/lib/wws/portefeuille/opslag";
import { CombiAnalyse } from "./CombiAnalyse";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: ReactNode }) => <a href="/archief">{children}</a>,
}));
const store = vi.hoisted(() => ({ adressen: vi.fn(), slaCombiAnalyseOp: vi.fn() }));
vi.mock("../tellingStore", () => ({
  portefeuilleStore: store,
  portefeuilleAdressenQuery: (id: string) => ({
    queryKey: ["portefeuille-adressen", id],
    queryFn: () => store.adressen(id),
  }),
}));
const bewaar = vi.hoisted(() => vi.fn());
vi.mock("@/lib/wws/pdf/laden", async (orig) => ({
  ...(await orig<typeof import("@/lib/wws/pdf/laden")>()),
  bewaarBestand: bewaar,
}));

const pf = (id: string, naam: string, klantId: string | null): Portefeuille => ({
  id,
  naam,
  klantId,
  bron: "import",
  createdBy: null,
  createdAt: "",
  aantalAdressen: 2,
  bloxsEigenaarRef: null,
  bloxsComplexRef: null,
  bloxsGesynchroniseerdOp: null,
});
const adres = (id: string, hn: number, klasse: string | null): AnalyseAdres => ({
  id,
  postcode: "1053ZD",
  huisnummer: hn,
  huisletter: "",
  toevoeging: "",
  resultaat: klasse
    ? {
        status: "gevonden",
        energieklasse: klasse,
        registratiedatum: "2022-01-01",
        geldigTot: null,
        opgehaaldOp: "2026-10-10T00:00:00Z",
      }
    : null,
});

const portefeuilles = [pf("p1", "Oost", "k1"), pf("p2", "West", "k2"), pf("p3", "Noord", "k1")];
const klanten = [
  { id: "k1", naam: "Amstel Wonen", pves: [] },
  { id: "k2", naam: "Rijn Vastgoed", pves: [] },
];

function toon(rollen: AppRole[], onOpen = vi.fn()) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <CombiAnalyse
        rechten={rechtenVan(rollen)}
        portefeuilles={portefeuilles}
        klanten={klanten}
        instellingen={PORTEFEUILLE_STANDAARD}
        onOpen={onOpen}
      />
    </QueryClientProvider>,
  );
  return onOpen;
}

describe("Analyse over meerdere portefeuilles", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    store.adressen.mockImplementation(async (id: string) =>
      id === "p1"
        ? [adres("a1", 1, "C"), adres("a2", 2, null)]
        : id === "p2"
          ? [adres("b1", 2, "F"), adres("b3", 3, "A")]
          : [adres("c9", 9, null)],
    );
    store.slaCombiAnalyseOp.mockResolvedValue("c1");
  });

  it("eigenaar kiezen voegt al zijn portefeuilles toe; dubbel adres telt één keer", async () => {
    toon(["member"]);
    expect(screen.getByText(/twee of meer portefeuilles/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Alle portefeuilles van eigenaar"), {
      target: { value: "k1" },
    });
    expect(screen.getByText("2 portefeuilles gekozen")).toBeInTheDocument();
    const lijst = screen.getByRole("list", { name: "Portefeuilles" });
    fireEvent.click(within(lijst).getByRole("checkbox", { name: /West/ }));
    // Oost (1, 2), West (2, 3), Noord (9): 4 unieke adressen
    expect(await screen.findByText(/4 adressen, waarvan/)).toBeInTheDocument();
    const nog = screen.getByRole("region", { name: "Nog niet opgehaald" });
    expect(within(nog).getByText(/Noord: 1 adres nog niet opgehaald/)).toBeInTheDocument();
    // adres 2 heeft in West wel een label: telt niet als 'nog niet opgehaald' in de analyse,
    // maar Oost heeft het zelf nog niet opgehaald
    expect(within(nog).getByText(/Oost: 1 adres nog niet opgehaald/)).toBeInTheDocument();
  });

  it("opslaan met titel, portefeuilles en eigenaren; PDF", async () => {
    toon(["member"]);
    const lijst = screen.getByRole("list", { name: "Portefeuilles" });
    fireEvent.click(within(lijst).getByRole("checkbox", { name: /Oost/ }));
    fireEvent.click(within(lijst).getByRole("checkbox", { name: /West/ }));
    await screen.findByText(/3 adressen, waarvan/);
    fireEvent.click(screen.getByRole("button", { name: "Analyse opslaan" }));
    await waitFor(() => expect(store.slaCombiAnalyseOp).toHaveBeenCalled());
    const [titel, delen, u] = store.slaCombiAnalyseOp.mock.calls[0]!;
    expect(titel).toBe("Oost + West");
    expect(delen).toEqual([
      { id: "p1", naam: "Oost", klantId: "k1" },
      { id: "p2", naam: "West", klantId: "k2" },
    ]);
    expect(u.aantalAdressen).toBe(3);
    fireEvent.click(screen.getByRole("button", { name: "PDF" }));
    await waitFor(() => expect(bewaar).toHaveBeenCalled());
    expect(bewaar.mock.calls[0]![0]).toMatch(
      /^Portefeuille-analyse_Oost_West_\d{4}-\d{2}-\d{2}\.pdf$/,
    );
  });

  it("kijkrol: geen opslaan; 'Openen' gaat naar de portefeuille", async () => {
    const onOpen = toon(["viewer"]);
    const lijst = screen.getByRole("list", { name: "Portefeuilles" });
    fireEvent.click(within(lijst).getByRole("checkbox", { name: /Oost/ }));
    fireEvent.click(within(lijst).getByRole("checkbox", { name: /Noord/ }));
    await screen.findByText(/adressen, waarvan/);
    expect(screen.queryByRole("button", { name: "Analyse opslaan" })).not.toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: "Openen" })[0]!);
    expect(onOpen).toHaveBeenCalledWith("p1");
  });
});
