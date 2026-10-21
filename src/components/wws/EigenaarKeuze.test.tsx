import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import EigenaarKeuze from "./EigenaarKeuze";

const klanten = vi.hoisted(() => ({
  voegToe: vi.fn(async (naam: string) => ({ id: "k2", naam, pves: [] })),
}));
vi.mock("./tellingStore", () => ({
  klantenStore: klanten,
  klantenQuery: () => ({
    queryKey: ["klanten"],
    queryFn: async () => [{ id: "k1", naam: "Testeigenaar", pves: [] }],
  }),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

function toon(props: Partial<Parameters<typeof EigenaarKeuze>[0]> = {}) {
  const onKies = vi.fn();
  render(
    <QueryClientProvider client={new QueryClient()}>
      <EigenaarKeuze klantId="" onKies={onKies} {...props} />
    </QueryClientProvider>,
  );
  return onKies;
}

describe("EigenaarKeuze", () => {
  it("toont één label, standaard ‘Eigenaar’ of het meegegeven label", () => {
    toon({ label: "Eigenaar (optioneel)" });
    expect(screen.getByText("Eigenaar (optioneel)")).toBeTruthy();
    expect(screen.queryByText("Eigenaar")).toBeNull();
  });

  it("voegt met magToevoegen een nieuwe eigenaar toe en kiest die", async () => {
    const onKies = toon({ magToevoegen: true });
    fireEvent.click(screen.getByRole("button", { name: "Eigenaar: geen" }));
    fireEvent.change(screen.getByLabelText("Zoek een eigenaar"), {
      target: { value: "TEST eigenaar" },
    });
    fireEvent.click(
      await screen.findByRole("button", { name: /‘TEST eigenaar’ toevoegen als nieuwe eigenaar/ }),
    );
    await waitFor(() => expect(onKies).toHaveBeenCalledWith("k2"));
    expect(klanten.voegToe).toHaveBeenCalledWith("TEST eigenaar");
  });

  it("zonder magToevoegen geen knop om toe te voegen", () => {
    toon();
    fireEvent.click(screen.getByRole("button", { name: "Eigenaar: geen" }));
    expect(screen.queryByText(/Nieuwe eigenaar toevoegen/)).toBeNull();
  });
});
