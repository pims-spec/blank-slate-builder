import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HAARLEMMERMEERSTRAAT_139H } from "@/lib/wws/inladen/huurprijscheck.fixtures";
import TellingInladenDialoog from "./TellingInladenDialoog";

const pdfRegels = vi.hoisted(() => vi.fn());
vi.mock("@/lib/wws/plattegrond/beeld", async (orig) => ({
  ...(await orig<typeof import("@/lib/wws/plattegrond/beeld")>()),
  pdfRegels,
}));
const opzoeken = vi.hoisted(() => ({
  zoekEnergielabel: vi.fn(),
  zoekMonument: vi.fn(),
  zoekCorop: vi.fn(),
}));
vi.mock("@/lib/wws/opzoeken/opzoeken.functions", () => opzoeken);
const NIET = { ok: false, fout: "niet_gevonden" };
const labelB = {
  ok: true,
  data: {
    Energieklasse: "B",
    Registratiedatum: "2022-03-14T00:00:00",
    Geldig_tot: "2032-03-14T00:00:00",
  },
};
beforeEach(() => {
  opzoeken.zoekEnergielabel.mockResolvedValue(NIET);
  opzoeken.zoekMonument.mockResolvedValue(NIET);
  opzoeken.zoekCorop.mockResolvedValue(NIET);
});
afterEach(() => pdfRegels.mockReset());

const pdf = () => new File(["x"], "rapport.pdf", { type: "application/pdf" });

function open() {
  const onOvernemen = vi.fn(async (_u: unknown) => {});
  render(<TellingInladenDialoog open onOpenChange={() => {}} onOvernemen={onOvernemen} />);
  const kies = (f: File) =>
    fireEvent.change(screen.getByLabelText("PDF"), { target: { files: [f] } });
  return { onOvernemen, kies };
}

describe("TellingInladenDialoog", () => {
  it("leest de bijlage in een rapport, toont de nakijkstap en neemt over", async () => {
    pdfRegels.mockResolvedValue([
      ["Puntentellingadvies", "Inleiding"],
      HAARLEMMERMEERSTRAAT_139H.split("\n").filter(Boolean),
    ]);
    const { onOvernemen, kies } = open();
    const knop = screen.getByRole("button", { name: "Overnemen als telling" });
    expect(knop).toBeDisabled();
    kies(pdf());

    const punten = await screen.findByRole("region", { name: "Punten" });
    const totaal = within(punten).getByText("Totaal").closest("tr")!;
    expect(within(totaal).getAllByText("216")).toHaveLength(2);
    expect(within(punten).getByText(/dezelfde punten/)).toBeInTheDocument();
    expect(screen.getByText(/Haarlemmermeerstraat 139H, 1058 JX Amsterdam/)).toBeInTheDocument();
    const ruimten = screen.getByRole("region", { name: "Ruimten" });
    expect(within(ruimten).getByText("Badkamer (2)")).toBeInTheDocument();
    expect(within(ruimten).getByText("Ruimten (7)")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Nakijken" })).toHaveTextContent(
      /zonder registratiedatum/,
    );
    expect(screen.getByLabelText("Niet opgehaald")).toHaveTextContent(
      /geen geregistreerd label gevonden bij EP-Online/,
    );
    expect(opzoeken.zoekEnergielabel).toHaveBeenCalledWith({
      data: { postcode: "1058JX", huisnummer: "139", huisletter: "H", huisnummertoevoeging: "" },
    });

    fireEvent.click(knop);
    expect(onOvernemen).toHaveBeenCalledTimes(1);
    expect(onOvernemen.mock.calls[0]![0]).toMatchObject({
      ok: true,
      meta: { huisnummer: "139H" },
    });
  });

  it("zelfde label in EP-Online: datum erbij; ander label: vinkje kiest EP-Online", async () => {
    pdfRegels.mockResolvedValue([HAARLEMMERMEERSTRAAT_139H.split("\n").filter(Boolean)]);
    opzoeken.zoekEnergielabel.mockResolvedValue(labelB);
    opzoeken.zoekCorop.mockResolvedValue({
      ok: true,
      data: { gemeentecode: "0363", gemeente: "Amsterdam", bouwjaar: 1934 },
    });
    const { onOvernemen, kies } = open();
    kies(pdf());
    const op = await screen.findByRole("region", { name: "Opgehaald" });
    expect(op).toHaveTextContent("Label B, geregistreerd 14-03-2022");
    expect(op).toHaveTextContent("Bouwjaar 1934 (BAG)");
    expect(screen.queryByRole("region", { name: "Ander energielabel" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Overnemen als telling" }));
    expect(onOvernemen.mock.calls[0]![0]).toMatchObject({
      meta: { bouwjaar: "1934" },
      input: {
        energie: { label: "B", datum: "2022-03-14" },
        woz: { corop: { gemeente: "Amsterdam" } },
      },
    });
  });

  it("ander label: Huurprijscheck blijft, het vinkje neemt EP-Online", async () => {
    pdfRegels.mockResolvedValue([HAARLEMMERMEERSTRAAT_139H.split("\n").filter(Boolean)]);
    opzoeken.zoekEnergielabel.mockResolvedValue({
      ok: true,
      data: { ...labelB.data, Energieklasse: "A", Registratiedatum: "2025-06-01T00:00:00" },
    });
    const { onOvernemen, kies } = open();
    kies(pdf());
    const verschil = await screen.findByRole("region", { name: "Ander energielabel" });
    expect(verschil).toHaveTextContent("Huurprijscheck: Label B. EP-Online nu: Label A");
    const punten = screen.getByRole("region", { name: "Punten" });
    expect(within(punten).getByText(/dezelfde punten/)).toBeInTheDocument();
    fireEvent.click(
      within(verschil).getByRole("checkbox", { name: "Label uit EP-Online gebruiken" }),
    );
    expect(within(punten).getByText(/andere punten/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Overnemen als telling" }));
    expect(onOvernemen.mock.calls[0]![0]).toMatchObject({ input: { energie: { label: "A" } } });
  });

  it("ophalen mislukt (geen verbinding): melden en toch overnemen", async () => {
    pdfRegels.mockResolvedValue([HAARLEMMERMEERSTRAAT_139H.split("\n").filter(Boolean)]);
    opzoeken.zoekEnergielabel.mockRejectedValue(new Error("net"));
    opzoeken.zoekMonument.mockRejectedValue(new Error("net"));
    opzoeken.zoekCorop.mockRejectedValue(new Error("net"));
    const { onOvernemen, kies } = open();
    kies(pdf());
    const fouten = await screen.findByLabelText("Niet opgehaald");
    expect(within(fouten).getAllByRole("listitem")).toHaveLength(3);
    fireEvent.click(screen.getByRole("button", { name: "Overnemen als telling" }));
    expect(onOvernemen).toHaveBeenCalledTimes(1);
  });

  it("zonder Huurprijscheck: melding en niets over te nemen", async () => {
    pdfRegels.mockResolvedValue([["Een ander rapport"]]);
    const { kies } = open();
    kies(pdf());
    expect(await screen.findByText(/Geen ‘Resultaat Huurprijscheck’ gevonden/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Overnemen als telling" })).toBeDisabled();
  });

  it("geen PDF of een onleesbare PDF", async () => {
    const { kies } = open();
    kies(new File(["x"], "foto.jpg", { type: "image/jpeg" }));
    expect(await screen.findByText("Kies een PDF-bestand.")).toBeInTheDocument();
    pdfRegels.mockRejectedValue(new Error("kapot"));
    kies(pdf());
    expect(await screen.findByText(/kon niet worden gelezen/)).toBeInTheDocument();
  });
});
