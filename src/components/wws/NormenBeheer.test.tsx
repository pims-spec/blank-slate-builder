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
