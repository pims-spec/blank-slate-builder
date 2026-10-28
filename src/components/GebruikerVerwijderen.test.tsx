import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ tel: vi.fn(), verwijder: vi.fn(), sluit: vi.fn() }));
vi.mock("@tanstack/react-start", () => ({
  useServerFn: (fn: string) => (fn === "tel" ? mocks.tel : mocks.verwijder),
}));
vi.mock("@/lib/gebruikerVerwijderen.functions", () => ({
  bezitVanGebruiker: "tel",
  verwijderGebruiker: "verwijder",
}));
import { GebruikerVerwijderen } from "./GebruikerVerwijderen";

const jan = { id: "u-jan", display_name: "Jan", email: "jan@x.nl", magSchrijven: true };
const gebruikers = [
  { id: "u-pim", display_name: "Pim", email: "pim@x.nl", magSchrijven: true },
  jan,
  { id: "u-lees", display_name: "Lezer", email: "l@x.nl", magSchrijven: false },
  { id: "u-els", display_name: "Els", email: "els@x.nl", magSchrijven: true },
];

beforeEach(() => {
  vi.clearAllMocks();
  mocks.tel.mockResolvedValue({ tellingen: 12, huurindicaties: 3, portefeuilles: 1 });
});

function toon() {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <GebruikerVerwijderen gebruiker={jan} gebruikers={gebruikers} onSluit={mocks.sluit} />
    </QueryClientProvider>,
  );
}

describe("Gebruiker verwijderen", () => {
  it("toont de aantallen en kan pas verwijderen na het kiezen van een ontvanger", async () => {
    toon();
    expect(await screen.findByTestId("overdracht")).toHaveTextContent(
      "12 tellingen (met versies) en 3 huurindicaties gaan naar de gekozen collega. 1 portefeuille wordt gedeeld met de ontvanger.",
    );
    const knop = screen.getByRole("button", { name: "Definitief verwijderen" });
    expect(knop).toBeDisabled();
    const opties = Array.from(
      (screen.getByLabelText("Tellingen gaan naar") as HTMLSelectElement).options,
    ).map((o) => o.text);
    expect(opties).toEqual(["Kies een collega…", "Pim", "Els"]);

    mocks.verwijder.mockResolvedValue({
      ok: true,
      tellingen: 12,
      huurindicaties: 3,
      portefeuilles: 1,
    });
    fireEvent.change(screen.getByLabelText("Tellingen gaan naar"), { target: { value: "u-els" } });
    expect(screen.getByTestId("overdracht")).toHaveTextContent("gaan naar Els.");
    fireEvent.click(knop);
    await waitFor(() =>
      expect(mocks.verwijder).toHaveBeenCalledWith({
        data: { userId: "u-jan", ontvangerId: "u-els" },
      }),
    );
    await waitFor(() => expect(mocks.sluit).toHaveBeenCalled());
  });

  it("bij een fout blijft het venster open met de melding", async () => {
    mocks.verwijder.mockResolvedValue({ ok: false, fout: "niet_alles_overgedragen" });
    toon();
    await screen.findByTestId("overdracht");
    fireEvent.change(screen.getByLabelText("Tellingen gaan naar"), { target: { value: "u-pim" } });
    fireEvent.click(screen.getByRole("button", { name: "Definitief verwijderen" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Het account is niet verwijderd");
    expect(mocks.sluit).not.toHaveBeenCalled();
  });
});
