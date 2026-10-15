import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { rechtenVan, type AppRole } from "@/lib/rollen";
import { DEFAULT_NORMEN, type Normen } from "@/lib/wws";
import { maakTellingDoc, nieuweTellingStaat, type Telling } from "@/lib/wws/opslag";
import Archief from "./Archief";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, search }: { children: ReactNode; search?: object }) => (
    <a data-search={search ? JSON.stringify(search) : undefined}>{children}</a>
  ),
}));

const tellingStore = vi.hoisted(() => ({
  lijst: vi.fn(),
  verwijder: vi.fn(),
  zetFavoriet: vi.fn(),
}));
const klantenStore = vi.hoisted(() => ({ lijst: vi.fn() }));
vi.mock("./tellingStore", () => ({
  tellingStore,
  tellingenQuery: () => ({ queryKey: ["tellingen"], queryFn: () => tellingStore.lijst() }),
  klantenQuery: () => ({ queryKey: ["klanten"], queryFn: () => klantenStore.lijst() }),
}));

const N = DEFAULT_NORMEN as unknown as Normen;

function telling(id: string, naam: string, ownerId: string, ownerNaam: string, klantId = "") {
  const s = nieuweTellingStaat("x");
  s.meta = { ...s.meta, naam, klantId };
  return {
    ...maakTellingDoc(s, N, null),
    id,
    ownerId,
    ownerNaam,
    gewijzigdOp: "2026-10-14T10:00:00Z",
  };
}

function toon(roles: AppRole[], userId: string, voorIndeling = false) {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <Archief rechten={rechtenVan(roles)} userId={userId} voorIndeling={voorIndeling} />
    </QueryClientProvider>,
  );
}

const rijVan = (naam: string) => screen.getByText(naam).closest("tr")!;

beforeEach(() => {
  vi.clearAllMocks();
  const lijst: Telling[] = [
    telling("t1", "Eigen telling", "bob", "Bob", "k1"),
    telling("t2", "Van Anna", "anna", "Anna", "k2"),
  ];
  tellingStore.lijst.mockResolvedValue(lijst);
  klantenStore.lijst.mockResolvedValue([
    { id: "k1", naam: "Amstel Wonen", pves: [] },
    { id: "k2", naam: "Zeta Vastgoed", pves: [] },
  ]);
});

describe("Archief", () => {
  it("collega: eigen telling verwijderen mag, gedeelde niet; eigenaar en 'gedeeld door' zichtbaar", async () => {
    toon(["member"], "bob");
    await screen.findByText("Eigen telling");
    expect(
      within(rijVan("Eigen telling")).getByRole("button", { name: "Verwijderen" }),
    ).toBeTruthy();
    expect(within(rijVan("Van Anna")).queryByRole("button", { name: "Verwijderen" })).toBeNull();
    expect(within(rijVan("Van Anna")).getByText("gedeeld door Anna")).toBeTruthy();
    expect(await within(rijVan("Van Anna")).findByText("Zeta Vastgoed")).toBeTruthy();
  });

  it("kijkrol: gegroepeerd per collega, niets verwijderen, geen nieuwe telling", async () => {
    toon(["viewer"], "lezer");
    await screen.findByText("Eigen telling");
    expect(screen.getByRole("columnheader", { name: /Anna/ })).toBeTruthy();
    expect(screen.getByRole("columnheader", { name: /Bob/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Verwijderen" })).toBeNull();
    expect(screen.queryByText("Nieuwe telling")).toBeNull();
  });

  it("filter op eigenaar en wissen", async () => {
    toon(["admin", "member"], "bob");
    await screen.findByText("Eigen telling");
    await screen.findByRole("option", { name: "Amstel Wonen" });
    fireEvent.change(screen.getByLabelText("Eigenaar"), { target: { value: "k1" } });
    expect(screen.getByText("Eigen telling")).toBeTruthy();
    expect(screen.queryByText("Van Anna")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Filters wissen" }));
    expect(screen.getByText("Van Anna")).toBeTruthy();
  });

  it("favorieten: ster zet favoriet; favorieten eerst, dan op naam; niet bij een gedeelde telling", async () => {
    // de nep-opslag onthoudt de favoriet, zoals de database
    tellingStore.zetFavoriet.mockImplementation(async (t: Telling, aan: boolean) => {
      const huidig = (await tellingStore.lijst()) as Telling[];
      tellingStore.lijst.mockResolvedValue(
        huidig.map((x) => (x.id === t.id ? { ...x, meta: { ...x.meta, favoriet: aan } } : x)),
      );
    });
    toon(["member"], "bob");
    await screen.findByText("Eigen telling");
    const namen = () =>
      screen
        .getAllByRole("row")
        .slice(1)
        .map((r) => r.querySelector("td:nth-child(2) a")?.textContent);
    expect(namen()).toEqual(["Eigen telling", "Van Anna"]);
    expect(
      within(rijVan("Van Anna")).getByRole("button", { name: /Markeren als favoriet/ }),
    ).toBeDisabled();
    fireEvent.click(
      within(rijVan("Eigen telling")).getByRole("button", { name: /Markeren als favoriet/ }),
    );
    await waitFor(() => expect(tellingStore.zetFavoriet).toHaveBeenCalledTimes(1));
    expect(tellingStore.zetFavoriet.mock.calls[0]![0].id).toBe("t1");
    expect(tellingStore.zetFavoriet.mock.calls[0]![1]).toBe(true);
    expect(
      await within(rijVan("Eigen telling")).findByRole("button", { name: /Favoriet verwijderen/ }),
    ).toHaveAttribute("aria-pressed", "true");
  });

  it("admin: favoriet bovenaan binnen de groep", async () => {
    const lijst: Telling[] = [
      telling("t1", "Bbb", "bob", "Bob"),
      {
        ...telling("t2", "Zzz", "bob", "Bob"),
        meta: { ...telling("t2", "Zzz", "bob", "Bob").meta, favoriet: true },
      },
      telling("t3", "Aaa", "bob", "Bob"),
    ];
    tellingStore.lijst.mockResolvedValue(lijst);
    toon(["admin"], "admin");
    await screen.findByText("Zzz");
    const namen = screen
      .getAllByRole("row")
      .map((r) => r.querySelector("td:nth-child(2) a")?.textContent)
      .filter(Boolean);
    expect(namen).toEqual(["Zzz", "Aaa", "Bbb"]);
  });

  it("kiezen voor het indelingsadvies: melding, en Openen gaat naar de telling met het indelingsadvies", async () => {
    toon(["member"], "bob", true);
    await screen.findByText("Eigen telling");
    expect(screen.getByText(/Kies een telling om het indelingsadvies voor te openen/)).toBeTruthy();
    const open = within(rijVan("Eigen telling")).getByText("Openen").closest("a")!;
    expect(JSON.parse(open.dataset["search"]!)).toEqual({ id: "t1", indeling: true });
  });

  it("gewoon archief: Openen zonder indelingsadvies", async () => {
    toon(["member"], "bob");
    await screen.findByText("Eigen telling");
    expect(screen.queryByText(/Kies een telling om het indelingsadvies/)).toBeNull();
    const open = within(rijVan("Eigen telling")).getByText("Openen").closest("a")!;
    expect(JSON.parse(open.dataset["search"]!)).toEqual({ id: "t1" });
  });
});
