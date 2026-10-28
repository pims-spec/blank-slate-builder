import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { legeInput, type WwsInput } from "@/lib/wws";
import type { TellingMeta } from "@/lib/wws/opslag";
import PlattegrondDialoog from "./PlattegrondDialoog";

const leesPlattegrond = vi.hoisted(() => vi.fn());
vi.mock("@/lib/wws/ai/ai.functions", () => ({ leesPlattegrond }));
const canvas = (width: number, height: number) => ({ width, height }) as HTMLCanvasElement;
const stapel = vi.hoisted(() => vi.fn());
vi.mock("@/lib/wws/plattegrond/beeld", async (orig) => ({
  ...(await orig<typeof import("@/lib/wws/plattegrond/beeld")>()),
  bestandNaarCanvas: vi.fn(async () => canvas(1000, 800)),
  pdfAantalPaginas: vi.fn(async () => 2),
  pdfPaginasNaarCanvassen: vi.fn(async () => [canvas(500, 400)]),
  canvasNaarJpeg: vi.fn(async () => new Blob(["jpeg"], { type: "image/jpeg" })),
  stapelCanvassen: stapel,
  blobNaarBytes: vi.fn(async () => new Uint8Array([1, 2, 3])),
}));

beforeAll(() => {
  URL.createObjectURL = vi.fn(() => "blob:x");
  URL.revokeObjectURL = vi.fn();
});
afterEach(() => {
  leesPlattegrond.mockReset();
  stapel.mockReset();
});

const ruimte = (type: string, naam: string, m2: number, soort = "vertrek") => ({
  soort,
  type,
  naam,
  m2,
  bron: "afgelezen",
  bbox: { x: 0.1, y: 0.1, w: 0.2, h: 0.2 },
});
const antwoord = (ruimten: object[], buiten: object[] = []) => ({
  ok: true,
  data: {
    maatvoering: "mm",
    ruimten,
    keuken: {},
    sanitair: {},
    buitenruimten: buiten,
    nameten: [],
  },
  gebruik: { gebruikt: 1, limiet: 30 },
});

function open() {
  const onOvernemen = vi.fn();
  render(
    <PlattegrondDialoog
      open
      onOpenChange={() => {}}
      input={legeInput()}
      meta={{} as TellingMeta}
      onOvernemen={onOvernemen}
    />,
  );
  return onOvernemen;
}
const kies = (files: File[]) =>
  fireEvent.change(screen.getByLabelText(/Plattegrond \(één of meer verdiepingen\)/), {
    target: { files },
  });

describe("Plattegrond inlezen: meer verdiepingen", () => {
  it("twee tekeningen: elk apart naar Claude met de verdieping, één tabel, beelden onder elkaar", async () => {
    stapel.mockReturnValue(canvas(1000, 1700));
    leesPlattegrond
      .mockResolvedValueOnce(antwoord([ruimte("woonkamer", "Woonkamer", 30)]))
      .mockResolvedValueOnce(
        antwoord([ruimte("slaapkamer", "Slaapkamer", 12)], [{ naam: "Balkon", m2: 6, bron: "x" }]),
      );
    const onOvernemen = open();
    kies([
      new File(["a"], "plattegrond begane grond.jpg", { type: "image/jpeg" }),
      new File(["b"], "plattegrond 1e verdieping.jpg", { type: "image/jpeg" }),
    ]);
    expect(
      await screen.findByRole("combobox", { name: "Verdieping: plattegrond begane grond.jpg" }),
    ).toHaveValue("Begane grond");
    expect(
      screen.getByRole("combobox", { name: "Verdieping: plattegrond 1e verdieping.jpg" }),
    ).toHaveValue("1e verdieping");

    fireEvent.click(screen.getByRole("button", { name: "Plattegrond inlezen" }));
    expect(await screen.findByText("Gevonden ruimten (2)")).toBeInTheDocument();
    expect(leesPlattegrond).toHaveBeenCalledTimes(2);
    expect(leesPlattegrond.mock.calls[1]![0].data.notitie).toContain(
      "Deze tekening is de 1e verdieping van de woning.",
    );
    const tabel = screen.getByRole("table");
    expect(within(tabel).getByText("Verdieping")).toBeInTheDocument();
    expect(within(tabel).getByText("Slaapkamer (1e verdieping)")).toBeInTheDocument();
    expect(stapel.mock.calls[0]![1]).toEqual(["Begane grond", "1e verdieping"]);

    fireEvent.click(screen.getByRole("button", { name: "Overnemen" }));
    const [nieuw, beeld] = onOvernemen.mock.calls[0]! as [
      WwsInput,
      { breedte: number; hoogte: number; verdiepingen?: { naam: string }[] },
    ];
    expect(nieuw.vertrekken.map((v) => v.naam)).toEqual([
      "Woonkamer (Begane grond)",
      "Slaapkamer (1e verdieping)",
    ]);
    expect(nieuw.vertrekken.every((v) => !("bbox" in v))).toBe(true);
    expect(nieuw.vertrekken.map((v) => v.verdieping)).toEqual(["Begane grond", "1e verdieping"]);
    expect(nieuw.buiten.ruimten[0]!.m2).toBe("6");
    expect(beeld).toMatchObject({ breedte: 1000, hoogte: 1700 });
    expect(beeld.verdiepingen!.map((v) => v.naam)).toEqual(["Begane grond", "1e verdieping"]);
  });

  it("een PDF met twee pagina's: twee tekeningen; een fout bij de tweede noemt de verdieping", async () => {
    leesPlattegrond
      .mockResolvedValueOnce(antwoord([ruimte("woonkamer", "Woonkamer", 30)]))
      .mockResolvedValueOnce({ ok: false, fout: "onbruikbaar_antwoord" });
    open();
    kies([new File(["%PDF"], "woning.pdf", { type: "application/pdf" })]);
    expect(
      await screen.findByRole("combobox", { name: "Verdieping: woning.pdf, pagina 2" }),
    ).toHaveValue("1e verdieping");
    fireEvent.click(screen.getByRole("button", { name: "Weghalen: woning.pdf, pagina 2" }));
    expect(screen.queryByRole("combobox", { name: "Verdieping: woning.pdf, pagina 2" })).toBeNull();
    kies([new File(["%PDF"], "zolder.png", { type: "image/png" })]);
    expect(await screen.findByRole("combobox", { name: "Verdieping: zolder.png" })).toHaveValue(
      "Zolder",
    );
    fireEvent.click(screen.getByRole("button", { name: "Plattegrond inlezen" }));
    expect(await screen.findByRole("status")).toHaveTextContent(/^Zolder: /);
    expect(screen.queryByText(/Gevonden ruimten/)).toBeNull();
  });

  it("twee keer dezelfde verdieping: eerst een andere kiezen", async () => {
    open();
    kies([
      new File(["a"], "a.jpg", { type: "image/jpeg" }),
      new File(["b"], "b.jpg", { type: "image/jpeg" }),
    ]);
    fireEvent.change(await screen.findByRole("combobox", { name: "Verdieping: b.jpg" }), {
      target: { value: "Begane grond" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Plattegrond inlezen" }));
    expect(screen.getByRole("status")).toHaveTextContent("dezelfde verdieping");
    expect(leesPlattegrond).not.toHaveBeenCalled();
  });

  it("hoogstens 4 tekeningen", async () => {
    open();
    kies(Array.from({ length: 5 }, (_, i) => new File(["a"], `t${i}.jpg`, { type: "image/jpeg" })));
    expect(await screen.findByRole("status")).toHaveTextContent("Hoogstens 4 tekeningen");
    expect(screen.getAllByRole("combobox", { name: /^Verdieping:/ })).toHaveLength(4);
  });
});
