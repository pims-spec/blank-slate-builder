import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import type { RapportPlattegrond } from "@/lib/wws/plattegrond/rapport";
import RapportPlattegronden from "./RapportPlattegronden";

const opslag = vi.hoisted(() => ({
  haal: vi.fn(() => new Promise(() => {})),
  bewaar: vi.fn(),
}));
vi.mock("./plattegrondBeeld", () => ({ plattegrondOpslag: opslag }));

// canvas en pdf.js bestaan niet in jsdom: nep-canvassen
const nepCanvas = () =>
  ({
    width: 100,
    height: 80,
    toDataURL: () => "data:image/jpeg;base64,AA==",
  }) as unknown as HTMLCanvasElement;
vi.mock("@/lib/wws/plattegrond/beeld", () => ({
  bestandNaarCanvas: vi.fn(async (f: File) => {
    if (f.name === "kapot.png") throw new Error("Dit bestand is geen geldige afbeelding.");
    return nepCanvas();
  }),
  pdfAantalPaginas: vi.fn(async () => 2),
  pdfPaginasNaarCanvassen: vi.fn(async (_: Blob, nrs: number[]) => nrs.map(() => nepCanvas())),
  canvasNaarJpeg: vi.fn(async () => new Blob(["x"], { type: "image/jpeg" })),
  blobNaarBytes: vi.fn(async () => new Uint8Array([0xff, 0xd8, 0xff])),
}));

const T = "11111111-1111-4111-8111-111111111111";
const pad = (n: number) => `${T}/00000000-0000-4000-8000-${String(n).padStart(12, "0")}.jpg`;
const lijst: RapportPlattegrond[] = [
  { pad: pad(1), breedte: 10, hoogte: 10, soort: "2d" },
  { pad: pad(2), breedte: 10, hoogte: 10, soort: "eigen", titel: "Zolder" },
];

const wrap = (n: ReactNode) => (
  <QueryClientProvider client={new QueryClient()}>{n}</QueryClientProvider>
);

describe("RapportPlattegronden", () => {
  it("nieuwe telling: eerst opslaan", () => {
    render(
      wrap(
        <RapportPlattegronden
          tellingId={T}
          isNieuw
          alleenLezen={false}
          lijst={[]}
          onWijzig={() => {}}
          onVerwijderd={() => {}}
        />,
      ),
    );
    expect(
      screen.getByRole("button", { name: "Plattegrond toevoegen aan rapport" }),
    ).toBeDisabled();
    expect(screen.getByText(/Sla de telling eerst op/)).toBeInTheDocument();
  });

  it("toont de paginatitels; volgorde wijzigen en verwijderen", () => {
    const onWijzig = vi.fn();
    const onVerwijderd = vi.fn();
    render(
      wrap(
        <RapportPlattegronden
          tellingId={T}
          isNieuw={false}
          alleenLezen={false}
          lijst={lijst}
          onWijzig={onWijzig}
          onVerwijderd={onVerwijderd}
        />,
      ),
    );
    expect(screen.getByText("Plattegrond 1 - 2D")).toBeInTheDocument();
    expect(screen.getByText("Plattegrond 2 - Zolder")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Plattegrond 2 omhoog" }));
    expect(onWijzig).toHaveBeenLastCalledWith([lijst[1], lijst[0]]);
    fireEvent.click(screen.getAllByRole("button", { name: "Verwijderen" })[0]!);
    expect(onWijzig).toHaveBeenLastCalledWith([lijst[1]]);
    expect(onVerwijderd).toHaveBeenCalledWith(pad(1));
    fireEvent.change(screen.getByRole("combobox", { name: "Soort plattegrond 1" }), {
      target: { value: "situatie" },
    });
    expect(onWijzig).toHaveBeenLastCalledWith([{ ...lijst[0], soort: "situatie" }, lijst[1]]);
  });

  it("alleen lezen zonder plattegronden: niets", () => {
    const { container } = render(
      wrap(
        <RapportPlattegronden
          tellingId={T}
          isNieuw={false}
          alleenLezen
          lijst={[]}
          onWijzig={() => {}}
          onVerwijderd={() => {}}
        />,
      ),
    );
    expect(container).toBeEmptyDOMElement();
  });
  it("meerdere bestanden tegelijk: afbeelding en PDF-pagina's, onleesbaar bestand gemeld", async () => {
    let n = 0;
    opslag.bewaar.mockImplementation(async () => ({ pad: pad(++n), breedte: 100, hoogte: 80 }));
    const onWijzig = vi.fn();
    render(
      wrap(
        <RapportPlattegronden
          tellingId={T}
          isNieuw={false}
          alleenLezen={false}
          lijst={[]}
          onWijzig={onWijzig}
          onVerwijderd={() => {}}
        />,
      ),
    );
    fireEvent.click(screen.getByRole("button", { name: "Plattegrond toevoegen aan rapport" }));
    const invoer = screen.getByLabelText("Bestanden met plattegronden") as HTMLInputElement;
    expect(invoer.multiple).toBe(true);
    const bestanden = [
      new File(["a"], "2d.png", { type: "image/png" }),
      new File(["b"], "meetrapport.pdf", { type: "application/pdf" }),
      new File(["c"], "kapot.png", { type: "image/png" }),
    ];
    fireEvent.change(invoer, { target: { files: bestanden } });
    expect(await screen.findByText("2d.png")).toBeInTheDocument();
    expect(screen.getByText("meetrapport.pdf – pagina 1")).toBeInTheDocument();
    expect(screen.getByText("meetrapport.pdf – pagina 2")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("kapot.png");
    fireEvent.click(screen.getByRole("button", { name: "Toevoegen (3)" }));
    await waitFor(() => expect(onWijzig).toHaveBeenCalled());
    expect(onWijzig.mock.calls[0]![0].map((x: RapportPlattegrond) => x.soort)).toEqual([
      "2d",
      "3d",
      "situatie",
    ]);
  });
});
