import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { HuurWoning } from "@/lib/wws/huur";
import HuurprijsIndicator from "./HuurprijsIndicator";

const navigate = vi.fn();
vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => navigate,
  Link: ({ children }: { children: ReactNode }) => <a>{children}</a>,
}));
const zoek = vi.hoisted(() => vi.fn());
vi.mock("@/lib/wws/huur/huur.functions", () => ({ zoekWoningVoorHuur: zoek }));
const store = vi.hoisted(() => ({ maakAan: vi.fn() }));
vi.mock("./tellingStore", () => ({ tellingStore: store }));

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

function toon(magSchrijven = true) {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <HuurprijsIndicator
        magSchrijven={magSchrijven}
        bewerker={{ id: "u1", naam: "Test Gebruiker", email: "t@x.nl" }}
      />
    </QueryClientProvider>,
  );
}

async function opzoeken() {
  fireEvent.change(screen.getByPlaceholderText("1234 AB"), { target: { value: "3511 AA" } });
  fireEvent.change(screen.getByLabelText("Huisnummer"), { target: { value: "12" } });
  fireEvent.click(screen.getByRole("button", { name: "Opzoeken" }));
  await screen.findByRole("region", { name: "Indicatie markthuur" });
}

beforeEach(() => {
  vi.clearAllMocks();
  zoek.mockResolvedValue({ ok: true, woning: WONING, meldingen: [] });
  store.maakAan.mockResolvedValue(undefined);
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
    expect(screen.getByRole("region", { name: "Bronnen" })).toHaveTextContent(
      /gemeente Utrecht.*NVM & VGM NL.*30 juni 2026/,
    );
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

  it("meerdere woningen: kiezen zoekt opnieuw met de letter", async () => {
    zoek.mockResolvedValueOnce({ ok: false, fout: "meerdere", keuzes: ["A", "B"] });
    toon();
    fireEvent.change(screen.getByPlaceholderText("1234 AB"), { target: { value: "3511AA" } });
    fireEvent.change(screen.getByLabelText("Huisnummer"), { target: { value: "12" } });
    fireEvent.click(screen.getByRole("button", { name: "Opzoeken" }));
    fireEvent.click(await screen.findByRole("button", { name: "12 B" }));
    await waitFor(() =>
      expect(zoek).toHaveBeenLastCalledWith({
        data: { postcode: "3511AA", huisnummer: "12", huisletter: "B", toevoeging: "" },
      }),
    );
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

  it("kijkrol: geen opzoeken", () => {
    toon(false);
    expect(screen.queryByRole("button", { name: "Opzoeken" })).toBeNull();
    expect(screen.getByRole("note")).toHaveTextContent(/kijkrol/);
  });
});
