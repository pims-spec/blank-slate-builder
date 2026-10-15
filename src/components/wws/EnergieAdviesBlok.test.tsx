import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { legeMeta } from "@/lib/wws/opslag";
import EnergieAdviesBlok from "./EnergieAdviesBlok";

vi.mock("@/lib/wws/plattegrond/beeld", () => ({
  pdfTekst: async () => ({
    n: 1,
    text: "[Pagina 1]\nVan label E naar B: isolatie, € 8.000",
    leeg: false,
  }),
}));
const leesEnergieAdvies = vi.hoisted(() => vi.fn());
vi.mock("@/lib/wws/ai/ai.functions", () => ({ leesEnergieAdvies }));

describe("Verduurzamingsadvies: Stoppen", () => {
  it("'Stoppen' breekt de aanroep af: melding 'Gestopt.', niets overgenomen", async () => {
    // de aanroep wacht tot hij wordt afgebroken, zoals een echte fetch
    leesEnergieAdvies.mockImplementation(
      ({ signal }: { signal: AbortSignal }) =>
        new Promise((_ok, fout) =>
          signal.addEventListener("abort", () => fout(new DOMException("weg", "AbortError"))),
        ),
    );
    const onZet = vi.fn();
    render(<EnergieAdviesBlok advies={undefined} meta={legeMeta()} magBewerken onZet={onZet} />);
    const f = new File(["%PDF"], "advies.pdf", { type: "application/pdf" });
    fireEvent.change(screen.getByLabelText("Advies (PDF)"), { target: { files: [f] } });
    fireEvent.click(screen.getByRole("button", { name: "Advies inlezen" }));
    fireEvent.click(await screen.findByRole("button", { name: "Stoppen" }));
    expect(await screen.findByText("Gestopt.")).toBeInTheDocument();
    expect(onZet).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole("button", { name: "Stoppen" })).toBeNull());
  });
});
