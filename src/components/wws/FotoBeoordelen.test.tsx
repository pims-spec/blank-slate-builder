import { useState } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { legeInput, type WwsInput } from "@/lib/wws";
import type { Beoordeling, ElementOordeel } from "@/lib/wws/foto/beoordeling";
import { ELEMENTEN } from "@/lib/wws/foto/elementen";
import { verkleinMaten } from "@/lib/wws/foto/beeld";
import type { FotoSortering } from "@/lib/wws/foto/sorteren";
import { aiMelding } from "@/lib/wws/ai/meldingen";
import FotoDialoog from "./FotoDialoog";
import WwsCalculator from "./WwsCalculator";

const beoordeelFotos = vi.hoisted(() => vi.fn());
const sorteerFotos = vi.hoisted(() => vi.fn());
vi.mock("@/lib/wws/ai/ai.functions", () => ({ beoordeelFotos, sorteerFotos }));
const klaarmaken = vi.hoisted(() => vi.fn());
vi.mock("@/lib/wws/foto/beeld", async (orig) => ({
  ...(await orig<typeof import("@/lib/wws/foto/beeld")>()),
  fotoKlaarmaken: klaarmaken,
}));

beforeAll(() => {
  URL.createObjectURL = vi.fn(() => "blob:" + Math.random());
  URL.revokeObjectURL = vi.fn();
});
afterEach(() => {
  beoordeelFotos.mockReset();
  sorteerFotos.mockReset();
  klaarmaken.mockReset();
});

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
const leegKeuken = (): Beoordeling =>
  Object.fromEntries(ELEMENTEN.keuken.map((e) => [e.sleutel, o()]));
const sort = (soort: FotoSortering["soort"]): FotoSortering => ({ soort, reden: "Te zien." });

/** De telling met eigen state, zodat wijzigingen zichtbaar worden */
function Telling({ begin }: { begin: WwsInput }) {
  const [inp, setInp] = useState(begin);
  return <WwsCalculator input={inp} setInput={setInp} />;
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
    fireEvent.click(screen.getByRole("button", { name: /^Controleren: Waarschijnlijk aanwezig/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Gecontroleerd" }));
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: /^Controleren: Waarschijnlijk/ })).toBeNull(),
    );
    expect(
      screen.getByRole("button", { name: "Controleren: Niet te schatten." }),
    ).toBeInTheDocument();
  });

  it("met de hand aanpassen haalt het ! bij dat veld weg; het laatste ! ook het label", () => {
    render(<Telling begin={keukenMetFoto()} />);
    fireEvent.click(screen.getAllByRole("button", { name: "Alles uitklappen" })[0]!);
    fireEvent.change(screen.getByRole("combobox", { name: /Lengte aanrecht/ }), {
      target: { value: ">=2" },
    });
    expect(screen.queryByRole("button", { name: "Controleren: Niet te schatten." })).toBeNull();
    fireEvent.click(screen.getByRole("checkbox", { name: /Inbouw vaatwasmachine/ }));
    expect(screen.queryByRole("button", { name: /^Controleren:/ })).toBeNull();
    expect(screen.queryByText(/Ingevuld uit foto's/)).toBeNull();
  });

  it("Alles gecontroleerd: alle ! en het label weg; geen knop per ruimte meer", () => {
    render(<Telling begin={keukenMetFoto()} />);
    expect(screen.queryByRole("button", { name: "Foto's beoordelen" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Alles gecontroleerd" }));
    expect(screen.queryByText(/Ingevuld uit foto's/)).toBeNull();
    fireEvent.click(screen.getAllByRole("button", { name: "Alles uitklappen" })[0]!);
    expect(screen.queryByRole("button", { name: /^Controleren:/ })).toBeNull();
  });

  it("ruimte toegevoegd uit foto's: 'Vul de m² in' tot de m² er staat", () => {
    render(
      <Telling
        begin={metRuimten((i) => {
          i.overig = [
            {
              type: "toilet",
              m2: "",
              verwarmd: false,
              herkomst: "Toegevoegd uit foto's",
              fac: { kind: "toilet", toilet: { toilet: "staand", fontein: false } },
            },
          ];
        })}
      />,
    );
    expect(screen.getByText("Toegevoegd uit foto's. Vul de m² in.")).toBeInTheDocument();
    fireEvent.change(screen.getAllByPlaceholderText("0,00")[0]!, { target: { value: "1,2" } });
    expect(screen.queryByText(/Vul de m² in/)).toBeNull();
  });
});

describe("FotoDialoog (hele woning)", () => {
  const kies = (n: number) =>
    fireEvent.change(screen.getByLabelText("Foto's kiezen"), {
      target: {
        files: Array.from(
          { length: n },
          (_, i) => new File(["x"], `f${i}.jpg`, { type: "image/jpeg" }),
        ),
      },
    });
  function openMet(input: WwsInput) {
    const onToepassen = vi.fn();
    render(<FotoDialoog open onOpenChange={() => {}} input={input} onToepassen={onToepassen} />);
    return onToepassen;
  }
  const keukenEnToilet = () =>
    metRuimten((i) => {
      i.vertrekken = [
        {
          type: "keuken",
          m2: 8,
          verwarmd: true,
          fac: { kind: "keuken", keuken: { lengte: "1-2", voorz: {} } },
        },
      ];
    });

  it("sorteert met kleine foto's, deelt in, beoordeelt per ruimte; ontbrekend toilet wordt nieuw", async () => {
    klaarmaken.mockImplementation(async (_b: Blob, max?: number) => ({
      data: max === 768 ? "KLEIN" : "GROOT",
      type: "image/jpeg",
    }));
    sorteerFotos.mockResolvedValue({
      ok: true,
      data: [sort("keuken"), sort("toilet"), sort("anders")],
      gebruik: { gebruikt: 1, limiet: 30 },
    });
    beoordeelFotos.mockImplementation(async ({ data }: { data: { ruimte: string } }) => ({
      ok: true,
      data: data.ruimte === "toilet" ? toiletUitslag() : leegKeuken(),
      gebruik: { gebruikt: 3, limiet: 30 },
    }));
    const onToepassen = openMet(keukenEnToilet());
    expect(screen.getByText(/kast naast de spoelbak en de hoge kast/)).toBeInTheDocument();
    expect(screen.getByText(/geen personen, namen, post/)).toBeInTheDocument();
    kies(3);
    fireEvent.click(screen.getByRole("button", { name: "Foto's sorteren" }));
    expect(await screen.findByRole("button", { name: "Beoordelen" })).toBeEnabled();
    expect(sorteerFotos.mock.calls[0]![0].data.fotos).toHaveLength(3);
    expect(sorteerFotos.mock.calls[0]![0].data.fotos[0].data).toBe("KLEIN");
    expect(screen.getByRole("combobox", { name: "Ruimte voor foto 1" })).toHaveValue(
      "vertrekken:0",
    );
    expect(screen.getByRole("combobox", { name: "Ruimte voor foto 2" })).toHaveValue(
      "nieuw:toilet",
    );
    expect(screen.getByRole("combobox", { name: "Ruimte voor foto 3" })).toHaveValue("geen");

    fireEvent.click(screen.getByRole("button", { name: "Beoordelen" }));
    expect(await screen.findByText(/Ingevuld in de telling/)).toBeInTheDocument();
    expect(beoordeelFotos).toHaveBeenCalledTimes(2);
    for (const [arg] of beoordeelFotos.mock.calls)
      expect(arg.data.fotos).toEqual([{ data: "GROOT", type: "image/jpeg" }]);
    const nieuw = onToepassen.mock.calls[0]![0] as WwsInput;
    expect(nieuw.overig).toHaveLength(1);
    expect(nieuw.overig[0]).toMatchObject({
      type: "toilet",
      m2: "",
      herkomst: "Toegevoegd uit foto's",
      fac: { kind: "toilet", toilet: { toilet: "hangend", fontein: true }, uitFoto: true },
    });
    expect(nieuw.vertrekken[0]!.fac).toMatchObject({ uitFoto: true });
    expect(screen.getByText("Toiletruimte (nieuw)")).toBeInTheDocument();
    expect(screen.getByText("Ingevuld, 1 veld met een uitroepteken.")).toBeInTheDocument();
  });

  it("twee toiletten in de telling: eerst kiezen, dan pas beoordelen", async () => {
    klaarmaken.mockResolvedValue({ data: "X", type: "image/jpeg" });
    sorteerFotos.mockResolvedValue({ ok: true, data: [sort("toilet")] });
    const input = metRuimten((i) => {
      i.overig = [1, 2].map((n) => ({
        type: "toilet" as const,
        naam: "Toilet " + (n === 1 ? "beneden" : "boven"),
        m2: 1,
        verwarmd: false,
        fac: { kind: "toilet" as const, toilet: { toilet: "staand" as const, fontein: false } },
      }));
    });
    openMet(input);
    kies(1);
    fireEvent.click(screen.getByRole("button", { name: "Foto's sorteren" }));
    const keuze = await screen.findByRole("combobox", { name: "Ruimte voor foto 1" });
    expect(keuze).toHaveValue("");
    expect(screen.getByRole("button", { name: "Beoordelen" })).toBeDisabled();
    expect(screen.getByText("Kies bij 1 foto de ruimte.")).toBeInTheDocument();
    fireEvent.change(keuze, { target: { value: "overig:1" } });
    expect(screen.getByRole("button", { name: "Beoordelen" })).toBeEnabled();
  });

  it("een ruimte mislukt: de andere wordt wel ingevuld", async () => {
    klaarmaken.mockResolvedValue({ data: "X", type: "image/jpeg" });
    sorteerFotos.mockResolvedValue({ ok: true, data: [sort("keuken"), sort("toilet")] });
    beoordeelFotos.mockImplementation(async ({ data }: { data: { ruimte: string } }) =>
      data.ruimte === "toilet"
        ? { ok: false, fout: "dienst_onbereikbaar" }
        : { ok: true, data: leegKeuken() },
    );
    const onToepassen = openMet(keukenEnToilet());
    kies(2);
    fireEvent.click(screen.getByRole("button", { name: "Foto's sorteren" }));
    fireEvent.click(await screen.findByRole("button", { name: "Beoordelen" }));
    expect(await screen.findByText(/Bij 1 ruimte ging het mis/)).toBeInTheDocument();
    expect(screen.getByText(aiMelding("dienst_onbereikbaar", "foto"))).toBeInTheDocument();
    const nieuw = onToepassen.mock.calls[0]![0] as WwsInput;
    expect(nieuw.overig).toHaveLength(0);
    expect(nieuw.vertrekken[0]!.fac).toMatchObject({ uitFoto: true });
  });

  it("fout bij sorteren: vaste melding, niets ingevuld; hoogstens 30 foto's", async () => {
    klaarmaken.mockResolvedValue({ data: "X", type: "image/jpeg" });
    sorteerFotos.mockResolvedValue({
      ok: false,
      fout: "limiet_bereikt",
      gebruik: { gebruikt: 30, limiet: 30 },
    });
    const onToepassen = openMet(keukenEnToilet());
    kies(32);
    expect(screen.getByText("30 van 30 foto's")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Foto 1 weghalen" }));
    expect(screen.getByText("29 van 30 foto's")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Foto's sorteren" }));
    expect(
      await screen.findByText(/daglimiet voor inlezen met AI is bereikt \(30 van 30\)/),
    ).toBeInTheDocument();
    expect(onToepassen).not.toHaveBeenCalled();
  });

  it("Stoppen tijdens het beoordelen: niets in de telling", async () => {
    klaarmaken.mockResolvedValue({ data: "X", type: "image/jpeg" });
    sorteerFotos.mockResolvedValue({ ok: true, data: [sort("keuken")] });
    beoordeelFotos.mockImplementation(
      ({ signal }: { signal: AbortSignal }) =>
        new Promise((_ok, fout) =>
          signal.addEventListener("abort", () => fout(new DOMException("weg", "AbortError"))),
        ),
    );
    const onToepassen = openMet(keukenEnToilet());
    kies(1);
    fireEvent.click(screen.getByRole("button", { name: "Foto's sorteren" }));
    fireEvent.click(await screen.findByRole("button", { name: "Beoordelen" }));
    fireEvent.click(await screen.findByRole("button", { name: "Stoppen" }));
    expect(
      await screen.findByText("Gestopt. Er is niets in de telling gezet."),
    ).toBeInTheDocument();
    expect(onToepassen).not.toHaveBeenCalled();
  });
});

describe("meldingen en verkleinen", () => {
  it("vaste meldingen voor de fotobeoordeling", () => {
    expect(aiMelding("dienst_onbereikbaar", "foto")).toBe(
      "Gemini is nu niet bereikbaar. Probeer het later opnieuw.",
    );
    expect(aiMelding("onbruikbaar_antwoord", "foto")).toMatch(/^Het antwoord was onbruikbaar/);
    expect(aiMelding("sleutel_ontbreekt", "foto")).toContain("GEMINI_API_KEY");
  });

  it("verkleinMaten: langste zijde hoogstens 1.568 px (of 768), nooit vergroten", () => {
    expect(verkleinMaten(4032, 3024)).toEqual({ w: 1568, h: 1176 });
    expect(verkleinMaten(3024, 4032, 768)).toEqual({ w: 576, h: 768 });
    expect(verkleinMaten(800, 600)).toEqual({ w: 800, h: 600 });
  });
});
