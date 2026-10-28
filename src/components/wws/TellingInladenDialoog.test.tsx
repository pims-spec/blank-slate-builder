import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HAARLEMMERMEERSTRAAT_139H } from "@/lib/wws/inladen/huurprijscheck.fixtures";
import TellingInladenDialoog from "./TellingInladenDialoog";

const pdfRegels = vi.hoisted(() => vi.fn());
vi.mock("@/lib/wws/plattegrond/beeld", async (orig) => ({
  ...(await orig<typeof import("@/lib/wws/plattegrond/beeld")>()),
  pdfRegels,
}));
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

    fireEvent.click(knop);
    expect(onOvernemen).toHaveBeenCalledTimes(1);
    expect(onOvernemen.mock.calls[0]![0]).toMatchObject({
      ok: true,
      meta: { huisnummer: "139H" },
    });
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
