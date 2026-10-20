import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { legeInput, type WwsInput } from "@/lib/wws";
import WwsCalculator from "./WwsCalculator";

function metInvoer(f: (i: WwsInput) => void) {
  const i = legeInput();
  f(i);
  render(<WwsCalculator input={i} setInput={() => {}} />);
}

describe("WwsCalculator", () => {
  it("rekent live mee als er een vertrek wordt toegevoegd", () => {
    render(<WwsCalculator />);
    expect(screen.getByText("Sociale huur")).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole("button", { name: "Vertrek toevoegen" })[0]!);
    fireEvent.change(screen.getAllByPlaceholderText("0,00")[0]!, { target: { value: "40" } });

    expect(screen.getByText("40 m² × 1")).toBeInTheDocument();
  });

  it("lengte × breedte: oppervlak volgt, minteken trekt af, maat toevoegen en verwijderen", () => {
    render(<WwsCalculator />);
    fireEvent.click(screen.getAllByRole("button", { name: "Vertrek toevoegen" })[0]!);
    fireEvent.change(screen.getByRole("combobox", { name: "Soort ruimte" }), {
      target: { value: "slaapkamer" },
    });
    const m2 = () => screen.getByTitle("Berekend uit lengte × breedte");
    fireEvent.change(screen.getByLabelText("Lengte in meter (Slaapkamer, maat 1)"), {
      target: { value: "5" },
    });
    fireEvent.change(screen.getByLabelText("Breedte in meter (Slaapkamer, maat 1)"), {
      target: { value: "4,5" },
    });
    expect(m2()).toHaveValue("22,5");
    fireEvent.click(screen.getByRole("button", { name: "+ lengte × breedte" }));
    fireEvent.change(screen.getByLabelText("Lengte in meter (Slaapkamer, maat 2)"), {
      target: { value: "-0,3" },
    });
    fireEvent.change(screen.getByLabelText("Breedte in meter (Slaapkamer, maat 2)"), {
      target: { value: "0,6" },
    });
    expect(m2()).toHaveValue("22,32");
    fireEvent.click(screen.getByRole("button", { name: "Maat 2 verwijderen (Slaapkamer)" }));
    expect(m2()).toHaveValue("22,5");
  });

  it("opmerking onder een verkeersruimte en een te kleine ruimte", () => {
    render(<WwsCalculator />);
    fireEvent.click(screen.getByRole("button", { name: "Ruimte toevoegen" }));
    fireEvent.change(screen.getByRole("combobox", { name: "Soort ruimte" }), {
      target: { value: "berging_in" },
    });
    expect(screen.queryByText(/Kleiner dan 2 m²/)).toBeNull();
    const m2 = screen.getAllByPlaceholderText("0,00")[0]!;
    fireEvent.change(m2, { target: { value: "1,5" } });
    expect(screen.getByText("Kleiner dan 2 m²: geen oppervlaktepunten.")).toBeInTheDocument();
  });

  it("nieuwe ruimte: nog geen soort (zoals de bron), valt op tot er gekozen is", () => {
    render(<WwsCalculator />);
    fireEvent.click(screen.getAllByRole("button", { name: "Vertrek toevoegen" })[0]!);
    fireEvent.click(screen.getByRole("button", { name: "Ruimte toevoegen" }));
    const [vertrek, overig] = screen.getAllByRole("combobox", { name: "Soort ruimte" });
    expect(vertrek).toHaveValue("");
    expect(vertrek).toHaveAttribute("aria-invalid", "true");
    expect(screen.getAllByRole("option", { name: "Kies soort ruimte…" })[0]).toBeDisabled();
    // verwarmd volgens de bron: nieuw vertrek wel, overige ruimte niet
    const verwarmd = screen.getAllByRole("checkbox", { name: "Verwarmd" });
    expect(verwarmd[0]).toBeChecked();
    expect(verwarmd[1]).not.toBeChecked();
    expect(
      screen.getByText("Kies het soort ruimte. Tot dan telt deze ruimte mee als overig vertrek."),
    ).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(/^2 ruimten hebben nog geen soort/);

    fireEvent.change(vertrek!, { target: { value: "slaapkamer" } });
    fireEvent.change(overig!, { target: { value: "hal" } });
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByRole("option", { name: "Kies soort ruimte…" })).toBeNull();
  });

  it("energie: vier keuzerondjes in de volgorde van de bron; kiezen wisselt de velden", () => {
    render(<WwsCalculator />);
    const groep = screen.getByRole("radiogroup", { name: "Type energielabel of bouwjaar" });
    const rondjes = within(groep).getAllByRole("radio");
    expect(rondjes.map((r) => r.closest("label")!.textContent)).toEqual([
      "Energielabelvóór 2015",
      "Energie-Index2015-2021",
      "Label vanaf 2021NTA 8800",
      "Bouwjaargeen geldig label",
    ]);
    expect(within(groep).getByRole("radio", { name: /Label vanaf 2021/ })).toBeChecked();
    expect(screen.queryByRole("combobox", { name: "Grondslag" })).toBeNull();
    fireEvent.click(within(groep).getByRole("radio", { name: /Energie-Index/ }));
    expect(within(groep).getByRole("radio", { name: /Energie-Index/ })).toBeChecked();
    expect(screen.queryByRole("combobox", { name: "Labelklasse" })).toBeNull();
    // bouwjaar alleen bij "Bouwjaar (geen geldig label)", zoals de bron
    expect(screen.queryByLabelText("Bouwjaar (BAG)")).toBeNull();
    fireEvent.click(within(groep).getByRole("radio", { name: /geen geldig label/ }));
    expect(screen.getByLabelText("Bouwjaar (BAG)")).toHaveAttribute("placeholder", "Bijv. 1975");
    expect(screen.queryByLabelText("Registratiedatum")).toBeNull();
  });

  describe("samenvattingspaneel (renderSum)", () => {
    it("vrije sector: huurprijs zonder wettelijke maximale huur, exact-regel en segmentbalk", () => {
      metInvoer((i) => {
        i.vertrekken.push({ type: "woonkamer", m2: 300, verwarmd: true });
      });
      expect(
        screen.getByText("Huurprijs volgens WWS (vrije sector, geen wettelijke maximale huur)"),
      ).toBeInTheDocument();
      expect(screen.getByText("Vrije sector")).toBeInTheDocument();
      expect(screen.getByText(/afgerond op hele punten$/)).toBeInTheDocument();
      expect(screen.getByText("t/m 143")).toBeInTheDocument();
      expect(screen.getByText("t/m 186")).toBeInTheDocument();
      expect(screen.getByText("per maand", { exact: false })).toBeInTheDocument();
      expect(screen.queryByText(/Minder dan 40 punten/)).toBeNull();
    });

    it("onder de 40 punten: maximale kale huur met de melding uit de bron", () => {
      metInvoer(() => {});
      expect(
        screen.getByText("Maximale kale huur (huurprijstabel 1 januari 2026)"),
      ).toBeInTheDocument();
      expect(
        screen.getByText("Minder dan 40 punten: het laagste bedrag uit de tabel."),
      ).toBeInTheDocument();
    });

    it("opslagen: één regel met het bedrag, en inclusief opslagen", () => {
      metInvoer((i) => {
        i.vertrekken.push({ type: "woonkamer", m2: 150, verwarmd: true });
        i.opslag.keuze = "gemprov";
        i.opslag.monument = "gemprov";
      });
      expect(screen.getByText(/^\d+% gemeentelijk of provinciaal monument$/)).toBeInTheDocument();
      expect(screen.getByText("Inclusief opslagen")).toBeInTheDocument();
    });
  });
  describe("voorzieningen in- en uitklappen", () => {
    it("een nieuwe ruimte opent uitgeklapt; inklappen toont de samenvatting", () => {
      render(<WwsCalculator />);
      fireEvent.click(screen.getAllByRole("button", { name: "Vertrek toevoegen" })[0]!);
      fireEvent.change(screen.getByRole("combobox", { name: "Soort ruimte" }), {
        target: { value: "keuken" },
      });
      const knop = screen.getByRole("button", { name: /^Keuken: aanrecht/ });
      expect(knop).toHaveAttribute("aria-expanded", "true");
      expect(screen.getByRole("combobox", { name: "Lengte aanrecht" })).toBeInTheDocument();
      fireEvent.click(knop);
      expect(knop).toHaveAttribute("aria-expanded", "false");
      expect(screen.queryByRole("combobox", { name: "Lengte aanrecht" })).toBeNull();
    });

    it("een bestaande telling opent ingeklapt, met PvE-markering; alles uit- en inklappen", () => {
      metInvoer((i) => {
        i.vertrekken = [
          {
            type: "keuken",
            m2: 8,
            verwarmd: true,
            fac: {
              kind: "keuken",
              uitPve: true,
              keuken: { lengte: "1-2", voorz: { afzuig: true, koelkast: true } },
            },
          },
        ];
        i.overig = [
          {
            type: "toilet",
            m2: 1.2,
            verwarmd: false,
            fac: { kind: "toilet", toilet: { toilet: "hangend", fontein: false } },
          },
        ];
      });
      expect(
        screen.getByRole("button", { name: /Keuken: aanrecht 1–2 m, 2 voorzieningen/ }),
      ).toHaveAttribute("aria-expanded", "false");
      expect(screen.getByText(/Overgenomen uit het standaard PvE/)).toBeInTheDocument();
      expect(screen.queryByRole("combobox", { name: "Lengte aanrecht" })).toBeNull();

      fireEvent.click(screen.getAllByRole("button", { name: "Alles uitklappen" })[0]!);
      expect(screen.getByRole("combobox", { name: "Lengte aanrecht" })).toBeInTheDocument();
      expect(screen.getByRole("combobox", { name: "Toilet" })).toBeInTheDocument();
      fireEvent.click(screen.getAllByRole("button", { name: "Alles inklappen" })[0]!);
      expect(screen.queryByRole("combobox", { name: "Toilet" })).toBeNull();
    });

    it("alleen-lezen: alles zichtbaar, zonder knoppen", () => {
      const i = legeInput();
      i.overig = [
        {
          type: "toilet",
          m2: 1.2,
          verwarmd: false,
          fac: { kind: "toilet", toilet: { toilet: "staand", fontein: true } },
        },
      ];
      render(<WwsCalculator input={i} setInput={() => {}} alleenLezen />);
      expect(screen.getByRole("combobox", { name: "Toilet" })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /Alles uitklappen/ })).toBeNull();
    });
  });
});
