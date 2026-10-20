import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_NORMEN, type Normen } from "@/lib/wws";
import { huurNormen, standaardAntwoorden, type HuurWoning } from "@/lib/wws/huur";
import { maakHuurIndicatie } from "@/lib/wws/huur/opslag";
import HuurprijsIndicator from "./HuurprijsIndicator";

const navigate = vi.fn();
vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => navigate,
  Link: ({ children }: { children: ReactNode }) => <a>{children}</a>,
}));
const zoek = vi.hoisted(() => vi.fn());
vi.mock("@/lib/wws/huur/huur.functions", () => ({ zoekWoningVoorHuur: zoek }));
const store = vi.hoisted(() => ({ maakAan: vi.fn() }));
const huur = vi.hoisted(() => ({
  lijst: vi.fn(),
  bewaar: vi.fn(),
  koppelTelling: vi.fn(),
  verwijder: vi.fn(),
}));
vi.mock("./tellingStore", () => ({
  tellingStore: store,
  huurStore: huur,
  huurIndicatiesQuery: () => ({ queryKey: ["huurindicaties"], queryFn: () => huur.lijst() }),
  klantenQuery: () => ({ queryKey: ["klanten"], queryFn: async () => [] }),
  klantenStore: { lijst: vi.fn(async () => []), voegToe: vi.fn() },
}));

const WONING: HuurWoning = {
  postcode: "3511AA",
  huisnummer: "12",
  straat: "Teststraat",
  plaats: "Utrecht",
  gemeente: "Utrecht",
  provincie: "Utrecht",
  bagOppervlakte: 70,
  bouwjaar: 1968,
  gebruiksdoel: "woonfunctie",
  label: "C",
  labelDatum: "2023-03-01",
  gebouwtype: "Appartement",
};

function toon(magSchrijven = true, opnieuwId?: string) {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <HuurprijsIndicator
        magSchrijven={magSchrijven}
        opnieuwId={opnieuwId}
        bewerker={{ id: "u1", naam: "Test Gebruiker", email: "t@x.nl" }}
      />
    </QueryClientProvider>,
  );
}

/** Het venster staat meteen open: postcode en huisnummer + toevoeging, dan Doorgaan */
async function opzoeken(huisnummer = "12") {
  const venster = await screen.findByRole("dialog", { name: "Nieuwe huurprijsindicatie" });
  fireEvent.change(within(venster).getByPlaceholderText("1234 AB"), {
    target: { value: "3511 aa" },
  });
  fireEvent.change(within(venster).getByLabelText("Huisnummer + toevoeging"), {
    target: { value: huisnummer },
  });
  fireEvent.click(within(venster).getByRole("button", { name: "Doorgaan" }));
  await screen.findByRole("region", { name: "Indicatie markthuur" });
}

beforeEach(() => {
  vi.clearAllMocks();
  zoek.mockResolvedValue({ ok: true, woning: WONING, meldingen: [] });
  store.maakAan.mockResolvedValue(undefined);
  huur.lijst.mockResolvedValue([]);
  huur.bewaar.mockResolvedValue("ind-1");
  huur.koppelTelling.mockResolvedValue(undefined);
  huur.verwijder.mockResolvedValue(undefined);
});

describe("Huurprijsindicator", () => {
  it("zoekt op, vult de vragen voor en toont bandbreedte, factoren, bronnen en disclaimer", async () => {
    toon();
    await opzoeken();
    expect(zoek).toHaveBeenCalledWith({
      data: { postcode: "3511 AA", huisnummer: "12", huisletter: "", toevoeging: "" },
    });
    expect(screen.getByLabelText("Woningtype")).toHaveValue("appartement");
    expect(screen.getByLabelText("Gebruiksoppervlakte")).toHaveValue(70);
    expect(screen.getByLabelText("Energielabel")).toHaveValue("C");
    const markt = screen.getByRole("region", { name: "Indicatie markthuur" });
    expect(markt).toHaveTextContent(/Laag.*Verwacht.*Hoog/);
    expect(markt).toHaveTextContent("Betrouwbaarheid: hoog");
    const factoren = screen.getByRole("region", { name: "Invloed per factor" });
    expect(within(factoren).getAllByText("GoHome-inschatting").length).toBeGreaterThan(3);
    // woonplaats Utrecht (Pararius, Q3 2026); NVM/VGM NL voor de gemeente ter vergelijking
    const bronnen = screen.getByRole("region", { name: "Bronnen" });
    expect(bronnen).toHaveTextContent(/woonplaats Utrecht.*Pararius.*30 september 2026/);
    expect(bronnen).toHaveTextContent(/Ter vergelijking.*gemeente Utrecht.*NVM & VGM NL/);
    expect(screen.getByText(/indicatie, geen taxatie/)).toBeInTheDocument();
  });

  it("WWS-check als bandbreedte; het advies is de laagste van markthuur en maximale huur, met reden", async () => {
    toon();
    await opzoeken();
    const wws = screen.getByRole("region", { name: "WWS-check" });
    expect(wws).toHaveTextContent(/Naar verwachting \d+–\d+ punten/);
    expect(wws).toHaveTextContent(/Advies huurprijs/);
    expect(wws).toHaveTextContent(/Laagste van markthuur en wettelijke maximale huur/);
    expect(wws).toHaveTextContent(/advies is de (markthuur|wettelijke maximale huur)/);
  });

  it("gemeubileerd: de notitie over servicekosten", async () => {
    toon();
    await opzoeken();
    fireEvent.change(screen.getByLabelText("Oplevering"), { target: { value: "gemeubileerd" } });
    expect(screen.getByText(/hoort wettelijk bij de servicekosten/)).toBeInTheDocument();
  });

  it("venster: huisletter en toevoeging uit één veld ('12 A 2')", async () => {
    toon();
    await opzoeken("12 A 2");
    expect(zoek).toHaveBeenCalledWith({
      data: { postcode: "3511 AA", huisnummer: "12", huisletter: "A", toevoeging: "2" },
    });
    expect(screen.queryByRole("dialog")).toBeNull();
    // ander adres: het venster weer open
    fireEvent.click(screen.getByRole("button", { name: "Ander adres" }));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
  });

  it("meerdere woningen: in het venster kiezen zoekt opnieuw met de letter", async () => {
    zoek.mockResolvedValueOnce({ ok: false, fout: "meerdere", keuzes: ["A", "B"] });
    toon();
    const venster = await screen.findByRole("dialog");
    fireEvent.change(within(venster).getByPlaceholderText("1234 AB"), {
      target: { value: "3511AA" },
    });
    fireEvent.change(within(venster).getByLabelText("Huisnummer + toevoeging"), {
      target: { value: "12" },
    });
    fireEvent.click(within(venster).getByRole("button", { name: "Doorgaan" }));
    expect(await within(venster).findByRole("status")).toHaveTextContent(/meerdere woningen/);
    fireEvent.click(within(venster).getByRole("button", { name: "12 B" }));
    await waitFor(() =>
      expect(zoek).toHaveBeenLastCalledWith({
        data: { postcode: "3511 AA", huisnummer: "12", huisletter: "B", toevoeging: "" },
      }),
    );
    await screen.findByRole("region", { name: "Indicatie markthuur" });
  });

  it("Maak een volledige puntentelling: nieuwe telling met de bekende gegevens, dan naar de editor", async () => {
    toon();
    await opzoeken();
    fireEvent.click(screen.getByRole("button", { name: "Maak een volledige puntentelling" }));
    await waitFor(() => expect(navigate).toHaveBeenCalled());
    const [id, doc] = store.maakAan.mock.calls[0]!;
    expect(navigate).toHaveBeenCalledWith({ to: "/wws", search: { id } });
    expect(doc.meta).toMatchObject({
      postcode: "3511 AA",
      huisnummer: "12",
      adres: "Teststraat",
      plaats: "Utrecht",
      bouwjaar: "1968",
      opsteller: "Test Gebruiker",
    });
    expect(doc.input.energie).toMatchObject({ soort: "label", label: "C" });
    // de aangenomen oppervlakten gaan niet mee: zelf meten
    expect(doc.input.vertrekken.every((r: { m2: unknown }) => r.m2 === "")).toBe(true);
  });

  it("opslaan: uitkomst plus snapshot van bronregel en factoren; een telling wordt eraan gekoppeld", async () => {
    toon();
    await opzoeken();
    fireEvent.click(screen.getByRole("button", { name: "Opslaan" }));
    await screen.findByRole("button", { name: "Opgeslagen" });
    const [d, klant] = huur.bewaar.mock.calls[0]!;
    expect(klant).toBeNull();
    expect(d.versie).toBe(1);
    expect(d.gemaaktDoor).toBe("Test Gebruiker");
    expect(d.snapshot.normen.regels.map((r: { id: string }) => r.id)).toEqual([
      "par-wpl-utrecht",
      "gem-utrecht",
    ]);
    expect(d.snapshot.normen.factoren.afwerking.waarden.luxe).toBe(1.08);
    expect(d.markthuur.verwacht).toBeGreaterThan(0);
    expect(d.advies.reden).toMatch(/advies is de/);
    // een antwoord wijzigen: niet meer opgeslagen
    fireEvent.change(screen.getByLabelText("Oplevering"), { target: { value: "kaal" } });
    expect(screen.getByRole("button", { name: "Opslaan" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Opslaan" }));
    await screen.findByRole("button", { name: "Opgeslagen" });
    fireEvent.click(screen.getByRole("button", { name: "Maak een volledige puntentelling" }));
    await waitFor(() => expect(huur.koppelTelling).toHaveBeenCalled());
    expect(huur.koppelTelling.mock.calls[0]![0]).toBe("ind-1");
  });

  it("opnieuw vanuit het archief: woning en antwoorden overgenomen, opnieuw berekend, geen venster", async () => {
    const data = maakHuurIndicatie(
      WONING,
      { ...standaardAntwoorden(WONING), oplevering: "kaal" },
      huurNormen(null),
      DEFAULT_NORMEN as unknown as Normen,
      "Collega",
      "2026-10-01",
    );
    data.markthuur.verwacht = 1234; // oud bedrag; wordt opnieuw berekend
    huur.lijst.mockResolvedValue([
      {
        id: "i1",
        ownerId: "u1",
        ownerNaam: "Collega",
        klantId: null,
        tellingId: null,
        gemaaktOp: "2026-10-01T10:00:00Z",
        data,
      },
    ]);
    toon(true, "i1");
    await screen.findByRole("region", { name: "Indicatie markthuur" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByLabelText("Oplevering")).toHaveValue("kaal");
    expect(screen.getByRole("region", { name: "Indicatie markthuur" })).not.toHaveTextContent(
      "€ 1.234",
    );
    expect(screen.getByRole("button", { name: "Opslaan" })).toBeEnabled();
  });

  it("kijkrol: geen venster en geen opzoeken", () => {
    toon(false);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByRole("button", { name: "Adres invullen" })).toBeNull();
    expect(screen.getByRole("note")).toHaveTextContent(/kijkrol/);
  });
});
