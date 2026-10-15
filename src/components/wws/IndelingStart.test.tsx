import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import IndelingStart from "./IndelingStart";

const navigate = vi.fn();
vi.mock("@tanstack/react-router", () => ({ useNavigate: () => navigate }));
const toast = vi.hoisted(() => vi.fn());
vi.mock("sonner", () => ({ toast }));
const lijst = vi.hoisted(() => vi.fn());
vi.mock("./tellingStore", () => ({
  tellingenQuery: () => ({ queryKey: ["tellingen"], queryFn: () => lijst() }),
}));

function toon() {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <IndelingStart />
    </QueryClientProvider>,
  );
}

beforeEach(() => vi.clearAllMocks());

describe("startscherm indelingsadvies (toonIndelingStart)", () => {
  it("Bestaande telling kiezen: naar het archief om te kiezen", async () => {
    lijst.mockResolvedValue([{ id: "t1" }]);
    toon();
    await waitFor(() => expect(lijst).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 0));
    fireEvent.click(screen.getByRole("button", { name: "Bestaande telling kiezen" }));
    expect(navigate).toHaveBeenCalledWith({ to: "/archief", search: { indeling: true } });
  });

  it("nog geen tellingen: melding van de bron, niet naar het archief", async () => {
    lijst.mockResolvedValue([]);
    toon();
    await waitFor(() => expect(lijst).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 0));
    fireEvent.click(screen.getByRole("button", { name: "Bestaande telling kiezen" }));
    expect(toast).toHaveBeenCalledWith(
      "Nog geen tellingen om een indeling voor te verkennen. Kies ‘Blanco — plattegrond uploaden’ om er zonder bestaande telling mee te beginnen.",
    );
    expect(navigate).not.toHaveBeenCalled();
  });

  it("Blanco: naar een nieuwe telling met de Blanco-start", () => {
    lijst.mockResolvedValue([]);
    toon();
    fireEvent.click(screen.getByRole("button", { name: "Blanco — plattegrond uploaden" }));
    expect(navigate).toHaveBeenCalledWith({ to: "/wws", search: { blanco: true } });
  });
});
