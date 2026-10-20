import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_NORMEN,
  legeInput,
  type EnergieAdvies,
  type Normen,
  type WwsInput,
} from "@/lib/wws";
import EnergieAdviesKeuze from "./EnergieAdviesKeuze";

const N = DEFAULT_NORMEN as unknown as Normen;

function invoer(ea: Partial<EnergieAdvies> = {}): WwsInput {
  const x = legeInput();
  x.vertrekken.push({ type: "woonkamer", m2: 30, verwarmd: true });
  x.energie = { soort: "label", label: "C", indexKlasse: "", bouwjaar: "", datum: "2019-06-01" };
  x.energieAdvies = {
    datum: "2026-03-14",
    huidig: { label: "E" },
    maatregelen: ["C", "B", "A"].map((naar, i) => ({
      vanLabel: "E",
      naarLabel: naar,
      omschrijving: ["Maatregel " + naar],
      kostenMin: 5000 * (i + 1),
      kostenMax: 7000 * (i + 1),
    })),
    ...ea,
  };
  return x;
}

const toon = (x: WwsInput, magBewerken = true) => {
  const onZet = vi.fn();
  render(
    <EnergieAdviesKeuze
      input={x}
      normen={N}
      magBewerken={magBewerken}
      bewerker="Test Gebruiker"
      onZet={onZet}
    />,
  );
  return onZet;
};

describe("EnergieAdviesKeuze", () => {
  it("controlevraag met beide labels; voorstel voorgeselecteerd, pas gebruikt na 'Ja'", () => {
    const onZet = toon(invoer());
    const vraag = screen.getByRole("group", { name: "Controlevraag beginlabel" });
    expect(vraag).toHaveTextContent(
      "Het energieadvies van 14 maart 2026 gaat uit van label E. In EP-Online staat label C, geregistreerd op 1 juni 2019.",
    );
    expect(vraag).toHaveTextContent(
      "De WWS-punten van de huidige situatie blijven gebaseerd op label C.",
    );
    expect(vraag).toHaveTextContent("Voorstel: het advies");
    expect(screen.getByRole("note")).toHaveTextContent(
      "telt pas mee in de puntentelling na registratie",
    );
    expect(onZet).not.toHaveBeenCalled();
    fireEvent.click(within(vraag).getByRole("button", { name: "Ja, ga uit van het advies" }));
    expect(onZet).toHaveBeenCalledWith(
      expect.objectContaining({
        uitgangspunt: expect.objectContaining({
          keuze: "advies",
          label: "E",
          door: "Test Gebruiker",
        }),
      }),
    );
  });

  it("na bevestiging: wie en wanneer; wijzigen vraagt opnieuw", () => {
    const onZet = toon(
      invoer({
        uitgangspunt: {
          keuze: "advies",
          label: "E",
          door: "Test Gebruiker",
          op: "2026-10-15T09:00:00Z",
        },
      }),
    );
    expect(screen.queryByRole("group", { name: "Controlevraag beginlabel" })).toBeNull();
    expect(
      screen.getByText(/bevestigd door Test Gebruiker op 15 oktober 2026/),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Uitgangspunt wijzigen" }));
    fireEvent.click(screen.getByRole("button", { name: "Nee, gebruik EP-Online" }));
    expect(onZet.mock.calls[0]![0].uitgangspunt.keuze).toBe("registratie");
  });

  it("opties naast elkaar met effect; kiezen legt de optie vast", () => {
    const onZet = toon(invoer());
    expect(
      screen.getByRole("heading", { name: "Opties uit het energieadvies vergelijken" }),
    ).toBeInTheDocument();
    const kaarten = screen.getAllByRole("listitem", { name: /^Optie / });
    expect(kaarten).toHaveLength(3);
    // nog niet bevestigd: vanaf het geregistreerde label C
    expect(kaarten[1]).toHaveAccessibleName("Optie C → B");
    expect(kaarten[1]).toHaveTextContent(/Terugverdientijd/);
    expect(kaarten[1]).toHaveTextContent(/Extra huur/);
    fireEvent.click(within(kaarten[2]!).getByRole("button", { name: "Kies deze optie" }));
    expect(onZet.mock.calls[0]![0].gekozenOptie).toBe(2);
  });

  it("gekozen optie: verschil bij de andere, en terug naar automatisch", () => {
    const onZet = toon(invoer({ gekozenOptie: 0 }));
    const kaarten = screen.getAllByRole("listitem", { name: /^Optie / });
    expect(within(kaarten[0]!).getByRole("button", { name: "Gekozen" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(kaarten[1]).toHaveTextContent(/T\.o\.v\. de gekozen optie: \+\d+ punten/);
    fireEvent.click(screen.getByRole("button", { name: /Keuze opheffen/ }));
    expect("gekozenOptie" in onZet.mock.calls[0]![0]).toBe(false);
  });

  it("één optie: geen vergelijking; geen vraag als de labels gelijk zijn", () => {
    toon(
      invoer({
        huidig: { label: "C" },
        maatregelen: [{ vanLabel: "C", naarLabel: "A", kostenMin: 9000, kostenMax: 9000 }],
      }),
    );
    expect(
      screen.getByRole("heading", { name: "Optie uit het energieadvies" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Controlevraag beginlabel" })).toBeNull();
  });

  it("alleen-lezen: geen knoppen", () => {
    toon(invoer(), false);
    expect(screen.queryByRole("button")).toBeNull();
  });
});
