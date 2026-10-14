import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { rechtenVan, type AppRole } from "@/lib/rollen";
import Eigenaren from "./Eigenaren";

const klantenStore = vi.hoisted(() => ({
  lijst: vi.fn(),
  voegToe: vi.fn(),
  hernoem: vi.fn(),
  verwijder: vi.fn(),
}));
const tellingStore = vi.hoisted(() => ({ lijst: vi.fn() }));
vi.mock("./tellingStore", () => ({
  klantenStore,
  klantenQuery: () => ({ queryKey: ["klanten"], queryFn: () => klantenStore.lijst() }),
  tellingenQuery: () => ({ queryKey: ["tellingen"], queryFn: () => tellingStore.lijst() }),
}));

const t = (klantId: string) => ({ meta: { klantId } });

function toon(roles: AppRole[]) {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <Eigenaren rechten={rechtenVan(roles)} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  klantenStore.lijst.mockResolvedValue([
    { id: "k1", naam: "Amstel Wonen", pves: [] },
    { id: "k2", naam: "Zeta Vastgoed", pves: [] },
  ]);
  tellingStore.lijst.mockResolvedValue([t("k1"), t("k1"), t("k2"), t("")]);
});

describe("Eigenaren", () => {
  it("collega: toevoegen wel, hernoemen/verwijderen niet; aantal gekoppelde tellingen", async () => {
    toon(["member"]);
    expect(await screen.findByText("Amstel Wonen")).toBeInTheDocument();
    expect(await screen.findByText("2 tellingen")).toBeInTheDocument();
    expect(screen.getByText("1 telling")).toBeInTheDocument();
    expect(screen.getByLabelText("Naam nieuwe eigenaar")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Verwijderen" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Hernoemen" })).toBeNull();
  });

  it("kijkrol: alleen bekijken", async () => {
    toon(["viewer"]);
    expect(await screen.findByText("Amstel Wonen")).toBeInTheDocument();
    expect(screen.queryByLabelText("Naam nieuwe eigenaar")).toBeNull();
    expect(screen.queryByRole("button", { name: "Verwijderen" })).toBeNull();
  });

  it("admin: verwijderen vraagt bevestiging en noemt het aantal gekoppelde tellingen", async () => {
    klantenStore.verwijder.mockResolvedValue(undefined);
    toon(["admin", "member"]);
    await screen.findByText("2 tellingen");
    fireEvent.click(screen.getAllByRole("button", { name: "Verwijderen" })[0]!);
    expect(
      await screen.findByText(
        /‘Amstel Wonen’ verwijderen als eigenaar\? Er zijn 2 tellingen aan deze eigenaar gekoppeld; die blijven bestaan maar verliezen de koppeling\./,
      ),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Verwijderen" }));
    await waitFor(() => expect(klantenStore.verwijder).toHaveBeenCalledWith("k1"));
  });

  it("toevoegen: dubbele naam wordt niet verstuurd", async () => {
    toon(["member"]);
    await screen.findByText("Amstel Wonen");
    fireEvent.change(screen.getByLabelText("Naam nieuwe eigenaar"), {
      target: { value: " amstel wonen" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Toevoegen" }));
    expect(klantenStore.voegToe).not.toHaveBeenCalled();
  });
});
