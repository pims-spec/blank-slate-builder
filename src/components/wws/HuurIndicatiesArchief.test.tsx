import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_NORMEN, type Normen } from "@/lib/wws";
import { huurNormen, standaardAntwoorden, type HuurWoning } from "@/lib/wws/huur";
import { maakHuurIndicatie } from "@/lib/wws/huur/opslag";
import { HuurIndicatiesArchief } from "./HuurIndicatiesArchief";

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => vi.fn(),
  Link: ({ children, ...p }: { children: ReactNode; search?: unknown; to: string }) => (
    <a data-to={p.to} data-search={JSON.stringify(p.search ?? null)}>
      {children}
    </a>
  ),
}));
const huur = vi.hoisted(() => ({ lijst: vi.fn(), verwijder: vi.fn() }));
vi.mock("./tellingStore", () => ({
  huurStore: huur,
  huurIndicatiesQuery: () => ({ queryKey: ["huurindicaties"], queryFn: () => huur.lijst() }),
  klantenQuery: () => ({
    queryKey: ["klanten"],
    queryFn: async () => [{ id: "k1", naam: "Testeigenaar", pves: [] }],
  }),
}));

const W: HuurWoning = {
  postcode: "1012AB",
  huisnummer: "5",
  straat: "Teststraat",
  plaats: "Amsterdam",
  gemeente: "Amsterdam",
  provincie: "Noord-Holland",
  bagOppervlakte: 60,
  bouwjaar: 1930,
  gebruiksdoel: "woonfunctie",
  label: "D",
  labelDatum: "2022-01-01",
  gebouwtype: "Appartement",
};
const data = maakHuurIndicatie(
  W,
  standaardAntwoorden(W),
  huurNormen(null),
  DEFAULT_NORMEN as unknown as Normen,
  "Collega",
  "2026-10-01",
);
data.markthuur.verwacht = 1234; // zo opgeslagen; wordt niet opnieuw berekend
const rij = (id: string, ownerId: string, extra: object = {}) => ({
  id,
  ownerId,
  ownerNaam: ownerId === "u1" ? "Ik" : "Ander",
  klantId: null,
  tellingId: null,
  gemaaktOp: "2026-10-01T10:00:00Z",
  data,
  ...extra,
});

function toon(rechten = { magSchrijven: true, isAdmin: false }) {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <HuurIndicatiesArchief rechten={rechten} userId="u1" tabs={null} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  huur.lijst.mockResolvedValue([
    rij("i1", "u1", { klantId: "k1", tellingId: "t1" }),
    rij("i2", "ander"),
  ]);
  huur.verwijder.mockResolvedValue(undefined);
});

describe("Archief: huurprijsindicaties", () => {
  it("lijst met adres, eigenaar, markthuur en advies; zoeken op eigenaar", async () => {
    toon();
    const tabel = await screen.findByRole("table");
    expect(within(tabel).getAllByText("Teststraat 5")).toHaveLength(2);
    expect(within(tabel).getAllByText("€ 1.234")).toHaveLength(2);
    expect(await within(tabel).findByText("Testeigenaar")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Zoeken"), { target: { value: "testeigenaar" } });
    expect(within(screen.getByRole("table")).getAllByRole("row")).toHaveLength(2); // kop + 1
  });

  it("bekijken: zoals opgeslagen, met opnieuw berekenen en de gekoppelde telling", async () => {
    toon();
    fireEvent.click((await screen.findAllByRole("button", { name: "Bekijk Teststraat 5" }))[0]!);
    const b = screen.getByRole("region", { name: "Opgeslagen indicatie" });
    expect(b).toHaveTextContent("€ 1.234");
    expect(b).toHaveTextContent(/bronregel en factoren van toen/);
    expect(within(b).getByText("Opnieuw berekenen met huidige tabel")).toHaveAttribute(
      "data-search",
      JSON.stringify({ opnieuw: "i1" }),
    );
    expect(within(b).getByText("Telling openen")).toHaveAttribute(
      "data-search",
      JSON.stringify({ id: "t1" }),
    );
  });

  it("verwijderen alleen eigen indicaties (of admin), na bevestiging", async () => {
    toon();
    const knoppen = await screen.findAllByRole("button", { name: "Verwijder Teststraat 5" });
    expect(knoppen).toHaveLength(1);
    fireEvent.click(knoppen[0]!);
    fireEvent.click(await screen.findByRole("button", { name: "Verwijderen" }));
    await waitFor(() => expect(huur.verwijder).toHaveBeenCalledWith("i1"));
  });

  it("kijkrol: bekijken en PDF, niet verwijderen of opnieuw berekenen", async () => {
    toon({ magSchrijven: false, isAdmin: false });
    fireEvent.click((await screen.findAllByRole("button", { name: "Bekijk Teststraat 5" }))[0]!);
    expect(screen.queryByRole("button", { name: /^Verwijder/ })).toBeNull();
    expect(screen.queryByText("Opnieuw berekenen met huidige tabel")).toBeNull();
    expect(screen.getAllByRole("button", { name: "PDF Teststraat 5" })).toHaveLength(2);
  });
});
