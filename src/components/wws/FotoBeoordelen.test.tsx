import { useState } from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { legeInput, type WwsInput } from "@/lib/wws";
import type { Beoordeling, ElementOordeel } from "@/lib/wws/foto/beoordeling";
import { ELEMENTEN } from "@/lib/wws/foto/elementen";
import { verkleinMaten } from "@/lib/wws/foto/beeld";
import { aiMelding } from "@/lib/wws/ai/meldingen";
import FotoDialoog from "./FotoDialoog";
import WwsCalculator from "./WwsCalculator";

const beoordeelFotos = vi.hoisted(() => vi.fn());
vi.mock("@/lib/wws/ai/ai.functions", () => ({ beoordeelFotos }));
vi.mock("@/lib/wws/foto/beeld", async (orig) => ({
  ...(await orig<typeof import("@/lib/wws/foto/beeld")>()),
  fotoKlaarmaken: async () => ({ data: "AAAA", type: "image/jpeg" }),
}));

beforeAll(() => {
  URL.createObjectURL = vi.fn(() => "blob:test");
  URL.revokeObjectURL = vi.fn();
});
afterEach(() => beoordeelFotos.mockReset());

const o = (over: Partial<ElementOordeel> = {}): ElementOordeel => ({
  status: "niet_vast_te_stellen",
  vrijstaand: false,
  aantal: null,
  soort: null,
  bewijs: "Niet te zien.",
  fotos: [],
  ...over,
});
const toiletUitslag = (): Beoordeling => ({
  toilet: o({ status: "aanwezig", soort: "hangend", bewijs: "Wandcloset.", fotos: [1] }),
  fontein: o({ status: "waarschijnlijk_aanwezig", bewijs: "Bakje in de hoek.", fotos: [1] }),
});

/** De telling met eigen state, zodat wijzigingen zichtbaar worden */
function Telling({ begin, fotoBeoordelen = true }: { begin: WwsInput; fotoBeoordelen?: boolean }) {
  const [inp, setInp] = useState(begin);
  return <WwsCalculator input={inp} setInput={setInp} fotoBeoordelen={fotoBeoordelen} />;
}
function metRuimten(f: (i: WwsInput) => void) {
  const i = legeInput();
  f(i);
  return i;
}
const keukenMetFoto = () =>
  metRuimten((i) => {
    i.vertrekken = [
      {
        type: "keuken",
        m2: 8,
        verwarmd: true,
        fac: {
          kind: "keuken",
          uitFoto: true,
          fotoOnzeker: {
            vaatwasser: "Waarschijnlijk aanwezig: front zonder scharnier.",
            lengte: "Niet te schatten.",
          },
          keuken: { lengte: "1-2", voorz: { vaatwasser: true } },
        },
      },
    ];
  });

describe("telling: uitroeptekens van de fotobeoordeling", () => {
  it("label, ! met reden; Gecontroleerd haalt één ! weg", async () => {
    render(<Telling begin={keukenMetFoto()} />);
    expect(screen.getByText(/Controleer de velden met een uitroepteken/)).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: "Alles uitklappen" })[0]!);
    const vaat = screen.getByRole("button", { name: /^Controleren: Waarschijnlijk aanwezig/ });
    fireEvent.click(vaat);
    fireEvent.click(await screen.findByRole("button", { name: "Gecontroleerd" }));
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: /^Controleren: Waarschijnlijk/ })).toBeNull(),
    );
    expect(
      screen.getByRole("button", { name: "Controleren: Niet te schatten." }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Controleer de velden met een uitroepteken/)).toBeInTheDocument();
  });

  it("met de hand aanpassen haalt het ! bij dat veld weg; het laatste ! ook het label", () => {
    render(<Telling begin={keukenMetFoto()} />);
    fireEvent.click(screen.getAllByRole("button", { name: "Alles uitklappen" })[0]!);
    fireEvent.change(screen.getByRole("combobox", { name: /Lengte aanrecht/ }), {
      target: { value: ">=2" },
    });
    expect(screen.queryByRole("button", { name: "Controleren: Niet te schatten." })).toBeNull();
    expect(
      screen.getByRole("button", { name: /^Controleren: Waarschijnlijk/ }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("checkbox", { name: /Inbouw vaatwasmachine/ }));
    expect(screen.queryByRole("button", { name: /^Controleren:/ })).toBeNull();
    expect(screen.queryByText(/Ingevuld uit foto's/)).toBeNull();
  });

  it("Alles gecontroleerd: alle ! en het label weg", () => {
    render(<Telling begin={keukenMetFoto()} />);
    fireEvent.click(screen.getByRole("button", { name: "Alles gecontroleerd" }));
    expect(screen.queryByText(/Ingevuld uit foto's/)).toBeNull();
    fireEvent.click(screen.getAllByRole("button", { name: "Alles uitklappen" })[0]!);
    expect(screen.queryByRole("button", { name: /^Controleren:/ })).toBeNull();
  });

  it("knop alleen bij keuken, badkamer en toilet, en alleen met fotoBeoordelen", () => {
    const begin = metRuimten((i) => {
      i.vertrekken = [
        {
          type: "keuken",
          m2: 8,
          verwarmd: true,
          fac: { kind: "keuken", keuken: { lengte: "1-2", voorz: {} } },
        },
        { type: "slaap_san", m2: 12, verwarmd: true },
      ];
    });
    const { unmount } = render(<Telling begin={begin} />);
    expect(screen.getAllByRole("button", { name: "Foto's beoordelen" })).toHaveLength(1);
    unmount();
    render(<Telling begin={begin} fotoBeoordelen={false} />);
    expect(screen.queryByRole("button", { name: "Foto's beoordelen" })).toBeNull();
  });

  it("uitslag van Gemini komt in de telling, met ! bij wat onzeker is", async () => {
    beoordeelFotos.mockResolvedValue({
      ok: true,
      data: toiletUitslag(),
      gebruik: { gebruikt: 2, limiet: 30 },
    });
    const begin = metRuimten((i) => {
      i.overig = [
        {
          type: "toilet",
          m2: 1.2,
          verwarmd: false,
          fac: { kind: "toilet", toilet: { toilet: "staand", fontein: false } },
        },
      ];
    });
    render(<Telling begin={begin} />);
    fireEvent.click(screen.getByRole("button", { name: "Foto's beoordelen" }));
    const venster = await screen.findByRole("dialog");
    const f = new File(["x"], "wc.jpg", { type: "image/jpeg" });
    fireEvent.change(within(venster).getByLabelText("Foto's kiezen"), { target: { files: [f] } });
    fireEvent.click(within(venster).getByRole("button", { name: "Foto's beoordelen" }));
    expect(
      await within(venster).findByText(/Controleer de plek met een uitroepteken/),
    ).toBeInTheDocument();
    expect(beoordeelFotos).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { ruimte: "toilet", fotos: [{ data: "AAAA", type: "image/jpeg" }] },
      }),
    );
    expect(within(venster).getByText("Wandcloset.")).toBeInTheDocument();
    fireEvent.keyDown(venster, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.getByRole("combobox", { name: /Toilet/ })).toHaveValue("hangend");
    expect(screen.getByRole("checkbox", { name: /Fontein/ })).toBeChecked();
    expect(
      screen.getByRole("button", {
        name: "Controleren: Waarschijnlijk aanwezig: Bakje in de hoek.",
      }),
    ).toBeInTheDocument();
  });
});

describe("FotoDialoog", () => {
  const props = () => ({
    open: true,
    onOpenChange: () => {},
    ruimte: "keuken" as const,
    naam: "Keuken",
    onUitslag: vi.fn(() => 0),
  });
  const kies = (n: number) =>
    fireEvent.change(screen.getByLabelText("Foto's kiezen"), {
      target: {
        files: Array.from(
          { length: n },
          (_, i) => new File(["x"], `f${i}.jpg`, { type: "image/jpeg" }),
        ),
      },
    });

  it("tip, privacymelding; hoogstens 10 foto's", () => {
    render(<FotoDialoog {...props()} />);
    expect(screen.getByText(/kast naast de spoelbak en de hoge kast open/)).toBeInTheDocument();
    expect(screen.getByText(/geen personen, namen, post/)).toBeInTheDocument();
    kies(12);
    expect(screen.getByText("10 van 10 foto's")).toBeInTheDocument();
    expect(screen.getByText(/Hoogstens 10 foto's/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Foto 1 weghalen" }));
    expect(screen.getByText("9 van 10 foto's")).toBeInTheDocument();
  });

  it("fout: vaste melding, niets ingevuld", async () => {
    beoordeelFotos.mockResolvedValue({
      ok: false,
      fout: "limiet_bereikt",
      gebruik: { gebruikt: 30, limiet: 30 },
    });
    const p = props();
    render(<FotoDialoog {...p} />);
    kies(1);
    fireEvent.click(screen.getByRole("button", { name: "Foto's beoordelen" }));
    expect(
      await screen.findByText(/daglimiet voor inlezen met AI is bereikt \(30 van 30\)/),
    ).toBeInTheDocument();
    expect(p.onUitslag).not.toHaveBeenCalled();
  });

  it("Stoppen: Gestopt., niets ingevuld", async () => {
    beoordeelFotos.mockImplementation(
      ({ signal }: { signal: AbortSignal }) =>
        new Promise((_ok, fout) =>
          signal.addEventListener("abort", () => fout(new DOMException("weg", "AbortError"))),
        ),
    );
    const p = props();
    render(<FotoDialoog {...p} />);
    kies(2);
    fireEvent.click(screen.getByRole("button", { name: "Foto's beoordelen" }));
    fireEvent.click(await screen.findByRole("button", { name: "Stoppen" }));
    expect(await screen.findByText("Gestopt.")).toBeInTheDocument();
    expect(p.onUitslag).not.toHaveBeenCalled();
  });

  it("uitslag: alle elementen met status", async () => {
    const b = Object.fromEntries(ELEMENTEN.keuken.map((e) => [e.sleutel, o()]));
    b["magnetron"] = o({
      status: "aanwezig",
      vrijstaand: true,
      bewijs: "Op het aanrecht.",
      fotos: [2],
    });
    beoordeelFotos.mockResolvedValue({ ok: true, data: b, gebruik: { gebruikt: 1, limiet: 30 } });
    render(<FotoDialoog {...props()} />);
    kies(2);
    fireEvent.click(screen.getByRole("button", { name: "Foto's beoordelen" }));
    expect(await screen.findByText("Vrijstaand, telt niet")).toBeInTheDocument();
    expect(screen.getByText("(foto 2)")).toBeInTheDocument();
    expect(screen.getAllByText("Niet vast te stellen")).toHaveLength(ELEMENTEN.keuken.length - 1);
  });
});

describe("meldingen en verkleinen", () => {
  it("vaste meldingen voor de fotobeoordeling", () => {
    expect(aiMelding("dienst_onbereikbaar", "foto")).toBe(
      "Gemini is nu niet bereikbaar. Probeer het later opnieuw.",
    );
    expect(aiMelding("onbruikbaar_antwoord", "foto")).toMatch(/^Het antwoord was onbruikbaar/);
    expect(aiMelding("sleutel_ontbreekt", "foto")).toContain("GEMINI_API_KEY");
    expect(aiMelding("te_veel_verzoeken", "foto")).toMatch(/^Gemini is nu niet bereikbaar/);
  });

  it("verkleinMaten: langste zijde hoogstens 1.568 px, nooit vergroten", () => {
    expect(verkleinMaten(4032, 3024)).toEqual({ w: 1568, h: 1176 });
    expect(verkleinMaten(3024, 4032)).toEqual({ w: 1176, h: 1568 });
    expect(verkleinMaten(800, 600)).toEqual({ w: 800, h: 600 });
  });
});
