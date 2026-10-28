import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { kiesInMenu, menuKeuzes } from "@/test/menu";
import { rechtenVan, type AppRole } from "@/lib/rollen";
import { DEFAULT_NORMEN, type Normen } from "@/lib/wws";
import { maakTellingDoc, nieuweTellingStaat, type Telling } from "@/lib/wws/opslag";
import { HAARLEMMERMEERSTRAAT_139H } from "@/lib/wws/inladen/huurprijscheck.fixtures";
import Archief from "./Archief";

const navigate = vi.hoisted(() => vi.fn());
vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => navigate,
  Link: ({ children, search }: { children: ReactNode; search?: object }) => (
    <a data-search={search ? JSON.stringify(search) : undefined}>{children}</a>
  ),
}));

const tellingStore = vi.hoisted(() => ({
  lijst: vi.fn(),
  maakAan: vi.fn(async () => {}),
  verwijder: vi.fn(),
  zetFavoriet: vi.fn(),
}));
const klantenStore = vi.hoisted(() => ({ lijst: vi.fn() }));
const delenStore = vi.hoisted(() => ({
  collegas: vi.fn(async () => [
    { id: "anna", naam: "Anna", email: "anna@x.nl" },
    { id: "cor", naam: "Cor", email: "cor@x.nl" },
  ]),
  gedeeldMet: vi.fn(async () => [] as string[]),
  deel: vi.fn(async () => {}),
  ontdeel: vi.fn(async () => {}),
}));
const versiesLijst = vi.hoisted(() => vi.fn());
const pdfRegels = vi.hoisted(() => vi.fn());
vi.mock("@/lib/wws/opzoeken/opzoeken.functions", () => {
  const niet = vi.fn(async () => ({ ok: false, fout: "niet_gevonden" }));
  return { zoekEnergielabel: niet, zoekMonument: niet, zoekCorop: niet };
});
vi.mock("@/lib/wws/plattegrond/beeld", async (orig) => ({
  ...(await orig<typeof import("@/lib/wws/plattegrond/beeld")>()),
  pdfRegels,
}));
vi.mock("./tellingStore", () => ({
  tellingStore,
  delenStore,
  tellingenQuery: () => ({ queryKey: ["tellingen"], queryFn: () => tellingStore.lijst() }),
  klantenQuery: () => ({ queryKey: ["klanten"], queryFn: () => klantenStore.lijst() }),
  dashboardVersiesQuery: () => ({ queryKey: ["dashboard-versies"], queryFn: () => versiesLijst() }),
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

const BEWERKER = { id: "bob", naam: "Bob", email: "bob@x.nl" };
function toon(roles: AppRole[], userId: string, voorIndeling = false) {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <Archief
        rechten={rechtenVan(roles)}
        userId={userId}
        voorIndeling={voorIndeling}
        bewerker={BEWERKER}
      />
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
  versiesLijst.mockResolvedValue({ versies: [], limietBereikt: false });
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
      await menuKeuzes(
        within(rijVan("Eigen telling")).getByRole("button", {
          name: "Meer acties voor Eigen telling",
        }),
      ),
    ).toEqual(["Delen", "Verwijderen"]);
    expect(within(rijVan("Van Anna")).queryByRole("button", { name: /Meer acties/ })).toBeNull();
    expect(within(rijVan("Van Anna")).getByText("gedeeld door Anna")).toBeTruthy();
    expect(await within(rijVan("Van Anna")).findByText("Zeta Vastgoed")).toBeTruthy();
  });

  it("delen vanuit het archief: alleen eigen tellingen; collega aanvinken deelt", async () => {
    toon(["member"], "bob");
    await screen.findByText("Eigen telling");
    expect(within(rijVan("Van Anna")).queryByRole("button", { name: /Meer acties/ })).toBeNull();
    await kiesInMenu(
      within(rijVan("Eigen telling")).getByRole("button", {
        name: "Meer acties voor Eigen telling",
      }),
      "Delen",
    );
    const d = await screen.findByRole("dialog");
    expect(within(d).getByText("Telling delen")).toBeTruthy();
    fireEvent.click(await within(d).findByRole("checkbox", { name: /Cor/ }));
    await waitFor(() => expect(delenStore.deel).toHaveBeenCalledWith("t1", "cor"));
  });

  it("kijkrol: gegroepeerd per collega, niets verwijderen, geen nieuwe telling", async () => {
    toon(["viewer"], "lezer");
    await screen.findByText("Eigen telling");
    expect(screen.getByRole("columnheader", { name: /Anna/ })).toBeTruthy();
    expect(screen.getByRole("columnheader", { name: /Bob/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Verwijderen" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Delen" })).toBeNull();
    expect(screen.queryByRole("button", { name: /Meer acties/ })).toBeNull();
    expect(screen.queryByText("Nieuwe telling")).toBeNull();
    expect(screen.queryByText("Telling inladen")).toBeNull();
  });

  it("telling inladen: overnemen maakt een gewone telling aan en opent die", async () => {
    pdfRegels.mockResolvedValue([HAARLEMMERMEERSTRAAT_139H.split("\n").filter(Boolean)]);
    toon(["member"], "bob");
    await screen.findByText("Eigen telling");
    fireEvent.click(screen.getByRole("button", { name: "Telling inladen" }));
    const d = await screen.findByRole("dialog", { name: "Telling inladen" });
    fireEvent.change(within(d).getByLabelText("PDF"), {
      target: { files: [new File(["x"], "hpc.pdf", { type: "application/pdf" })] },
    });
    await within(d).findByRole("region", { name: "Punten" });
    await within(d).findByLabelText("Niet opgehaald");
    fireEvent.click(within(d).getByRole("button", { name: "Overnemen als telling" }));
    await waitFor(() => expect(navigate).toHaveBeenCalled());
    const [id, doc] = tellingStore.maakAan.mock.calls[0] as unknown as [string, Telling];
    expect(doc.meta).toMatchObject({
      adres: "Haarlemmermeerstraat",
      huisnummer: "139H",
      opsteller: "Bob",
    });
    expect(doc.laatstePunten).toBe(216);
    expect(doc.lastEditedBy).toEqual(BEWERKER);
    expect(navigate).toHaveBeenCalledWith({ to: "/wws", search: { id } });
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

  it("versies: aantal per telling; bij meerdere een keuzelijst, en Openen opent de gekozen versie", async () => {
    const meer = telling("t1", "Eigen telling", "bob", "Bob");
    meer.aantalVersies = 2;
    const een = telling("t2", "Van Anna", "anna", "Anna");
    een.aantalVersies = 1;
    tellingStore.lijst.mockResolvedValue([meer, een]);
    versiesLijst.mockResolvedValue({
      versies: [
        {
          tellingId: "t1",
          nr: 1,
          notitie: "Begin",
          createdAt: "2026-03-04T10:00:00Z",
          resultaat: { totaal: 97 },
        },
        { tellingId: "t1", nr: 2, notitie: "Na renovatie", createdAt: "2026-05-01T10:00:00Z" },
        { tellingId: "t2", nr: 1, notitie: "Enige", createdAt: "2026-03-04T10:00:00Z" },
      ],
      limietBereikt: false,
    });
    toon(["member"], "bob");
    await screen.findByText("Eigen telling");
    expect(screen.getByRole("columnheader", { name: "Versies" })).toBeTruthy();
    expect(within(rijVan("Van Anna")).getByText("1 versie")).toBeTruthy();
    expect(within(rijVan("Van Anna")).queryByRole("combobox")).toBeNull();

    const r = rijVan("Eigen telling");
    expect(within(r).getByText("2 versies")).toBeTruthy();
    const keuze = await within(r).findByRole("combobox", {
      name: "Te openen versie: Eigen telling",
    });
    expect([...(keuze as HTMLSelectElement).options].map((o) => o.text)).toEqual([
      "Werkversie",
      "v2 — Na renovatie",
      "v1 — Begin · 97 punten",
    ]);
    const open = () => JSON.parse(within(r).getByText("Openen").closest("a")!.dataset["search"]!);
    expect(open()).toEqual({ id: "t1" });
    fireEvent.change(keuze, { target: { value: "1" } });
    expect(open()).toEqual({ id: "t1", versie: 1 });
    // de kolom Punten toont nu de punten van de gekozen versie
    expect(within(r).getByText("97")).toBeTruthy();
    expect(within(r).getByText("v1")).toBeTruthy();
  });
});
