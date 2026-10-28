import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { legeInput } from "@/lib/wws";
import type { TellingMeta } from "@/lib/wws/opslag";
import MapDialoog from "./MapDialoog";

const sorteerFotos = vi.hoisted(() => vi.fn());
const leesPlattegrond = vi.hoisted(() => vi.fn());
vi.mock("@/lib/wws/ai/ai.functions", () => ({
  sorteerFotos,
  leesPlattegrond,
  beoordeelFotos: vi.fn(),
}));
const klaarmaken = vi.hoisted(() => vi.fn());
vi.mock("@/lib/wws/plattegrond/beeld", async (orig) => ({
  ...(await orig<typeof import("@/lib/wws/plattegrond/beeld")>()),
  pdfAantalPaginas: vi.fn(async () => 1),
}));
vi.mock("@/lib/wws/foto/beeld", async (orig) => ({
  ...(await orig<typeof import("@/lib/wws/foto/beeld")>()),
  fotoKlaarmaken: klaarmaken,
}));

beforeAll(() => {
  URL.createObjectURL = vi.fn(() => "blob:" + Math.random());
  URL.revokeObjectURL = vi.fn();
});
afterEach(() => {
  sorteerFotos.mockReset();
  klaarmaken.mockReset();
});

const meta = {} as TellingMeta;
const bestand = (pad: string, type: string) => {
  const f = new File(["x"], pad.split("/").pop()!, { type });
  Object.defineProperty(f, "webkitRelativePath", { value: pad });
  return f;
};

function openMet() {
  const onPlattegrond = vi.fn();
  const onFotos = vi.fn();
  render(
    <MapDialoog
      open
      onOpenChange={() => {}}
      input={legeInput()}
      meta={meta}
      onPlattegrond={onPlattegrond}
      onFotos={onFotos}
    />,
  );
  return { onPlattegrond, onFotos };
}

function kiesMap(files: File[]) {
  const invoer = screen.getByText("Map kiezen").querySelector("input")!;
  expect(invoer).toHaveAttribute("webkitdirectory");
  fireEvent.change(invoer, { target: { files } });
}

describe("MapDialoog", () => {
  it("verdeelt de map, herkent met Gemini, laat nakijken en gaat naar de plattegrond en de foto's", async () => {
    klaarmaken.mockResolvedValue({ data: "KLEIN", type: "image/jpeg" });
    sorteerFotos.mockResolvedValue({
      ok: true,
      data: [
        { soort: "keuken", reden: "Aanrecht." },
        { soort: "plattegrond", reden: "Tekening." },
        { soort: "toilet", reden: "Wandcloset." },
      ],
      gebruik: { gebruikt: 1, limiet: 30 },
    });
    openMet();
    kiesMap([
      bestand("Woning/IMG_1.jpg", "image/jpeg"),
      bestand("Woning/IMG_2.jpg", "image/jpeg"),
      bestand("Woning/IMG_3.jpg", "image/jpeg"),
      bestand("Woning/notities.txt", "text/plain"),
      bestand("Woning/IMG_4.HEIC", "image/heic"),
    ]);
    expect(screen.getByRole("status")).toHaveTextContent("3 foto's gevonden.");
    expect(screen.getByText("2 bestanden overgeslagen")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Herkennen en nakijken" }));
    expect(await screen.findByRole("button", { name: "Verder" })).toBeEnabled();
    expect(sorteerFotos.mock.calls[0]![0].data).toMatchObject({ metPlattegrond: true });
    expect(sorteerFotos.mock.calls[0]![0].data.fotos).toHaveLength(3);
    expect(screen.getByRole("combobox", { name: "Wat is IMG_2.jpg" })).toHaveValue("Begane grond");
    expect(screen.getByText("Plattegrond (Gemini)")).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Wat is IMG_1.jpg" })).toHaveValue("keuken");
    expect(screen.getByRole("combobox", { name: "Wat is IMG_3.jpg" })).toHaveValue("toilet");

    // de derde foto niet gebruiken
    fireEvent.change(screen.getByRole("combobox", { name: "Wat is IMG_3.jpg" }), {
      target: { value: "niet" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Verder" }));
    expect(screen.getByText(/Stap 1 van 2: Plattegrond inlezen/)).toBeInTheDocument();
    expect(screen.getByText("IMG_2.jpg")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Overnemen en verder naar de foto's" }),
    ).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Plattegrond overslaan" }));
    expect(screen.getByText(/Stap 2 van 2: Foto's indelen/)).toBeInTheDocument();
    // alleen IMG_1 gaat mee, als keuken (er is nog geen keuken: een nieuwe)
    const lijst = screen.getByRole("combobox", { name: "Ruimte voor foto 1" });
    expect(lijst).toHaveValue("nieuw:keuken");
    expect(screen.queryByRole("combobox", { name: "Ruimte voor foto 2" })).toBeNull();
    expect(screen.getByRole("button", { name: "Beoordelen" })).toBeEnabled();
  });

  it("vóór het herkennen een bestand weghalen met ✕: gaat niet naar Gemini", async () => {
    klaarmaken.mockResolvedValue({ data: "KLEIN", type: "image/jpeg" });
    sorteerFotos.mockResolvedValue({
      ok: true,
      data: [{ soort: "keuken", reden: "Aanrecht." }],
    });
    openMet();
    kiesMap([bestand("Woning/a.jpg", "image/jpeg"), bestand("Woning/b.jpg", "image/jpeg")]);
    expect(screen.getByRole("status")).toHaveTextContent("2 foto's gevonden.");
    fireEvent.click(screen.getByRole("button", { name: "Weghalen: b.jpg" }));
    expect(screen.queryByAltText("b.jpg")).toBeNull();
    expect(screen.getByRole("status")).toHaveTextContent("1 foto gevonden.");
    fireEvent.click(screen.getByRole("button", { name: "Herkennen en nakijken" }));
    expect(await screen.findByRole("button", { name: "Verder" })).toBeEnabled();
    expect(sorteerFotos.mock.calls[0]![0].data.fotos).toHaveLength(1);
    // na het herkennen geen ✕ meer (dan: Niet gebruiken)
    expect(screen.queryByRole("button", { name: "Weghalen: a.jpg" })).toBeNull();
  });

  it("alleen een PDF: geen AI-aanroep, direct de plattegrond", async () => {
    openMet();
    kiesMap([bestand("Woning/tekening.pdf", "application/pdf")]);
    fireEvent.click(screen.getByRole("button", { name: "Herkennen en nakijken" }));
    expect(sorteerFotos).not.toHaveBeenCalled();
    const kaart = screen.getByText("tekening.pdf").closest("li")!;
    expect(within(kaart).getByRole("combobox")).toHaveValue("Begane grond");
    expect(
      within(kaart)
        .getAllByRole("option")
        .map((o) => o.textContent),
    ).toEqual([
      "Begane grond",
      "1e verdieping",
      "2e verdieping",
      "3e verdieping",
      "Zolder",
      "Berging",
      "Niet gebruiken",
    ]);
    fireEvent.click(screen.getByRole("button", { name: "Verder" }));
    expect(screen.getByText("Plattegrond inlezen en nakijken")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Overnemen" })).toBeDisabled();
  });

  it("twee plattegronden: allebei als verdieping naar het inlezen", async () => {
    openMet();
    kiesMap([
      bestand("Woning/Plattegrond BG.pdf", "application/pdf"),
      bestand("Woning/Plattegrond 1e verdieping.pdf", "application/pdf"),
    ]);
    fireEvent.click(screen.getByRole("button", { name: "Herkennen en nakijken" }));
    expect(screen.getByText(/Kies bij elke plattegrond de verdieping/)).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Wat is Plattegrond BG.pdf" })).toHaveValue(
      "Begane grond",
    );
    // de gebruiker ziet dat de tweede tekening de zolder is (2e verdieping)
    fireEvent.change(
      screen.getByRole("combobox", { name: "Wat is Plattegrond 1e verdieping.pdf" }),
      {
        target: { value: "2e verdieping" },
      },
    );
    fireEvent.click(screen.getByRole("button", { name: "Verder" }));
    expect(
      await screen.findByRole("combobox", { name: "Verdieping: Plattegrond 1e verdieping.pdf" }),
    ).toHaveValue("2e verdieping");
    expect(screen.getByRole("combobox", { name: "Verdieping: Plattegrond BG.pdf" })).toHaveValue(
      "Begane grond",
    );
    // van laag naar hoog, ook al staat 1e verdieping eerder in de map
    expect(screen.getAllByRole("combobox", { name: /^Verdieping:/ })[0]).toHaveAccessibleName(
      "Verdieping: Plattegrond BG.pdf",
    );
  });

  it("herkennen mislukt: toch nakijken, met de melding", async () => {
    klaarmaken.mockResolvedValue({ data: "KLEIN", type: "image/jpeg" });
    sorteerFotos.mockResolvedValue({ ok: false, fout: "limiet_bereikt" });
    openMet();
    kiesMap([bestand("Woning/a.jpg", "image/jpeg")]);
    fireEvent.click(screen.getByRole("button", { name: "Herkennen en nakijken" }));
    expect(await screen.findByRole("button", { name: "Verder" })).toBeEnabled();
    expect(screen.getByRole("status")).toHaveTextContent("Kijk zelf na wat de plattegrond is.");
    // niet herkend: een foto waarvan de ruimte later wordt gekozen
    expect(screen.getByRole("combobox", { name: "Wat is a.jpg" })).toHaveValue("foto");
    // niets gekozen → foutmelding
    fireEvent.change(screen.getByRole("combobox", { name: "Wat is a.jpg" }), {
      target: { value: "niet" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Verder" }));
    expect(screen.getByRole("status")).toHaveTextContent(
      "Kies een plattegrond of minstens één foto.",
    );
  });

  it("zonder Google-instellingen geen Drive-knop", () => {
    openMet();
    expect(screen.queryByRole("button", { name: "Uit Google Drive" })).toBeNull();
  });
});
