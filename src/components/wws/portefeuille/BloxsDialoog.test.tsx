import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Portefeuille } from "@/lib/wws/portefeuille/opslag";
import { BloxsDialoog } from "./BloxsDialoog";

const fn = vi.hoisted(() => ({
  bloxsFunctiesTesten: vi.fn(),
  bloxsEigenaren: vi.fn(),
  bloxsObjectenPagina: vi.fn(),
  bloxsAdressen: vi.fn(),
}));
vi.mock("@/lib/wws/bloxs/bloxs.functions", () => fn);
const store = vi.hoisted(() => ({ maak: vi.fn(), bloxsSyncOpslaan: vi.fn() }));
const klantenStore = vi.hoisted(() => ({ voegToe: vi.fn(), lijst: vi.fn() }));
vi.mock("../tellingStore", () => ({ portefeuilleStore: store, klantenStore }));

const klanten = [{ id: "k1", naam: "Amstel Wonen", pves: [] }];
const eerdere: Portefeuille = {
  id: "p0",
  naam: "Oud",
  klantId: "k1",
  bron: "bloxs",
  createdBy: null,
  createdAt: "",
  aantalAdressen: 0,
  bloxsEigenaarRef: "8",
  bloxsComplexRef: null,
  bloxsGesynchroniseerdOp: null,
};

function toon() {
  const onKlaar = vi.fn();
  render(
    <BloxsDialoog
      open
      onOpenChange={() => {}}
      klanten={klanten}
      bestaand={null}
      portefeuilles={[eerdere]}
      onKlaar={onKlaar}
    />,
  );
  return onKlaar;
}

describe("Bloxs: eigenaar in GoHome", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fn.bloxsFunctiesTesten.mockResolvedValue({ ok: true, data: true, aanvragen: 1 });
    fn.bloxsEigenaren.mockResolvedValue({
      ok: true,
      aanvragen: 1,
      data: [
        { id: 7, referentie: "E7", naam: "Nieuwe Eigenaar" },
        { id: 8, referentie: "E8", naam: "Heel Andere Naam" },
        { id: 9, referentie: "E9", naam: "amstel wonen" },
      ],
    });
    fn.bloxsObjectenPagina.mockImplementation(async ({ data }: { data: { soort: string } }) => ({
      ok: true,
      aanvragen: 1,
      data: {
        objecten:
          data.soort === "building"
            ? [
                {
                  ref: "1",
                  soort: "building",
                  referentie: "B1",
                  complexId: null,
                  complexNaam: null,
                  adresId: 5,
                },
              ]
            : [],
        volgende: null,
      },
    }));
    fn.bloxsAdressen.mockResolvedValue({
      ok: true,
      aanvragen: 1,
      data: [
        {
          adresId: "5",
          ok: true,
          postcode: "1053ZD",
          huisnummer: 1,
          huisletter: "",
          toevoeging: "",
          straat: "S",
          woonplaats: "W",
        },
      ],
    });
    store.maak.mockResolvedValue("p1");
    store.bloxsSyncOpslaan.mockResolvedValue({
      vervallenObjecten: 0,
      gemarkeerd: 0,
      teruggekeerd: 0,
    });
    klantenStore.voegToe.mockResolvedValue({ id: "k9", naam: "Nieuwe Eigenaar", pves: [] });
  });

  async function kiesEnHaal(naam: string) {
    const lijst = await screen.findByRole("list", { name: "Eigenaren" });
    fireEvent.click(within(lijst).getByRole("button", { name: new RegExp(naam) }));
    fireEvent.click(screen.getByRole("button", { name: "Objecten ophalen" }));
    await screen.findByRole("button", { name: "Inladen" });
    return screen.getByLabelText("Eigenaar in GoHome (optioneel)") as HTMLSelectElement;
  }

  it("eerdere koppeling van dezelfde Bloxs-eigenaar gaat voor", async () => {
    toon();
    expect((await kiesEnHaal("Heel Andere Naam")).value).toBe("k1");
  });

  it("zelfde naam (hoofdletters tellen niet)", async () => {
    toon();
    expect((await kiesEnHaal("amstel wonen")).value).toBe("k1");
  });

  it("anders: nieuwe eigenaar voorgesteld en bij inladen aangemaakt en gekoppeld", async () => {
    const onKlaar = toon();
    const select = await kiesEnHaal("Nieuwe Eigenaar");
    expect(select.selectedOptions[0]!.textContent).toBe("+ Nieuw in GoHome: Nieuwe Eigenaar");
    fireEvent.click(screen.getByRole("button", { name: "Inladen" }));
    await waitFor(() => expect(onKlaar).toHaveBeenCalledWith("p1"));
    expect(klantenStore.voegToe).toHaveBeenCalledWith("Nieuwe Eigenaar");
    expect(store.maak).toHaveBeenCalledWith("Nieuwe Eigenaar", "k9", {
      eigenaarRef: "7",
      complexRef: null,
    });
  });

  it("'Geen eigenaar' maakt niets aan", async () => {
    toon();
    const select = await kiesEnHaal("Nieuwe Eigenaar");
    fireEvent.change(select, { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Inladen" }));
    await waitFor(() => expect(store.maak).toHaveBeenCalled());
    expect(klantenStore.voegToe).not.toHaveBeenCalled();
    expect(store.maak.mock.calls[0]![1]).toBeNull();
  });
});
