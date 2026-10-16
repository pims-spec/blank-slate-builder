import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { DEFAULT_NORMEN, type Normen } from "@/lib/wws";
import NormenBeheer from "./NormenBeheer";

const instellingenStore = vi.hoisted(() => ({ slaNormenOp: vi.fn() }));
vi.mock("./tellingStore", () => ({ instellingenStore }));

const N = DEFAULT_NORMEN as unknown as Normen;

describe("Normen terugzetten naar standaard (btnNormReset)", () => {
  it("na bevestiging staat de standaard in het formulier; pas opgeslagen bij 'Normen opslaan'", async () => {
    instellingenStore.slaNormenOp.mockResolvedValue(undefined);
    const aangepast = { ...structuredClone(N), oppVertrek: 9, naam: "Eigen normen" };
    render(
      <QueryClientProvider client={new QueryClient()}>
        <NormenBeheer normen={aangepast} />
      </QueryClientProvider>,
    );
    expect(screen.getByLabelText("Per m² vertrek")).toHaveValue("9");
    fireEvent.click(screen.getByRole("button", { name: "Normen terugzetten naar standaard" }));
    expect(
      screen.getByText(/Alle normen terugzetten naar de standaardwaarden\?/),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Terugzetten" }));
    await waitFor(() =>
      expect(screen.getByLabelText("Per m² vertrek")).toHaveValue(String(N.oppVertrek)),
    );
    expect(instellingenStore.slaNormenOp).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Normen opslaan" }));
    fireEvent.click(await screen.findByRole("button", { name: "Opslaan" }));
    await waitFor(() => expect(instellingenStore.slaNormenOp).toHaveBeenCalledTimes(1));
    const opgeslagen = instellingenStore.slaNormenOp.mock.calls[0]![0] as Normen;
    expect(opgeslagen.oppVertrek).toBe(N.oppVertrek);
    expect(opgeslagen.naam).toBe(N.naam);
  });
});

describe("Normen: portefeuille-analyse", () => {
  it("EFG-regels, grens verouderd en limiet instellen; omschrijving volgt; opgeslagen in normen.portefeuille", async () => {
    instellingenStore.slaNormenOp.mockResolvedValue(undefined);
    render(
      <QueryClientProvider client={new QueryClient()}>
        <NormenBeheer normen={structuredClone(N)} />
      </QueryClientProvider>,
    );
    expect(
      screen.getByText(
        /Omschrijving in de analyse: Woningen met label E, F of G per 1 januari 2029/,
      ),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("checkbox", { name: "D" }));
    fireEvent.change(screen.getByLabelText("EFG-regels: ingangsdatum"), {
      target: { value: "2030-01-01" },
    });
    fireEvent.change(screen.getByLabelText("EFG-regels: woningen zonder geregistreerd label"), {
      target: { value: "meetellen" },
    });
    fireEvent.change(screen.getByLabelText("EP-Online: aanvragen per seconde (max. 10)"), {
      target: { value: "1,5" },
    });
    fireEvent.change(screen.getByLabelText("Bloxs: aanvragen per seconde (max. 5)"), {
      target: { value: "0,5" },
    });
    expect(screen.getByText(/label D, E, F of G per 1 januari 2030/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Normen opslaan" }));
    fireEvent.click(await screen.findByRole("button", { name: "Opslaan" }));
    await waitFor(() => expect(instellingenStore.slaNormenOp).toHaveBeenCalled());
    const n = instellingenStore.slaNormenOp.mock.calls.at(-1)![0] as Normen;
    expect(n.portefeuille).toEqual({
      epPerSeconde: 1.5,
      bloxsPerSeconde: 0.5,
      verouderdVoor: "2021-01-01",
      efg: { ingangsdatum: "2030-01-01", klassen: ["D", "E", "F", "G"], geenLabel: "meetellen" },
    });
  });
});
