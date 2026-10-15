import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_NORMEN, type Normen } from "@/lib/wws";
import { maakTellingDoc, maakVersie, nieuweTellingStaat, type Telling } from "@/lib/wws/opslag";
import { facDefault, type WwsInput } from "@/lib/wws";
import type { Pve } from "@/lib/wws/pve";
import { berekenVarianten, ruimtenUitTelling, toepassen } from "@/lib/wws/indeling";
import { rechtenVan, type AppRole } from "@/lib/rollen";
import TellingEditor from "./TellingEditor";

const navigate = vi.fn();
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: ReactNode }) => <a>{children}</a>,
  useNavigate: () => navigate,
  useBlocker: () => undefined,
}));

const store = vi.hoisted(() => ({
  lijst: vi.fn(),
  haal: vi.fn(),
  maakAan: vi.fn(),
  bewaar: vi.fn(),
  verwijder: vi.fn(),
  versies: vi.fn(),
  voegVersieToe: vi.fn(),
  werkVersieBij: vi.fn(),
  verwijderVersie: vi.fn(),
}));
const klantenStore = vi.hoisted(() => ({ lijst: vi.fn(), voegToe: vi.fn() }));
const delenStore = vi.hoisted(() => ({
  collegas: vi.fn(),
  gedeeldMet: vi.fn(),
  deel: vi.fn(),
  ontdeel: vi.fn(),
}));
vi.mock("./tellingStore", () => ({
  tellingStore: store,
  klantenStore,
  delenStore,
  klantenQuery: () => ({ queryKey: ["klanten"], queryFn: () => klantenStore.lijst() }),
}));

// Het verbeteradvies zelf is elders getest; hier alleen "Toepassen op telling" met een
// vooraf bepaalde uitkomst, om te zien dat de editor die ongewijzigd overneemt.
const advies = vi.hoisted(() => ({ input: null as unknown }));
vi.mock("./AdviesDialoog", () => ({
  default: ({ onToepassen }: { onToepassen: (i: unknown, n: number, p: number) => void }) => (
    <button type="button" onClick={() => onToepassen(advies.input, 1, 99)}>
      Advies toepassen (test)
    </button>
  ),
}));

// Downloads: de PDF wordt echt gemaakt (jsPDF), alleen het opslaan in de browser is nep
const bewaar = vi.hoisted(() => vi.fn());
vi.mock("@/lib/wws/pdf/laden", async (orig) => ({
  ...(await orig<typeof import("@/lib/wws/pdf/laden")>()),
  bewaarBestand: bewaar,
}));

// Adres opzoeken (PDOK) via de server function: nep
const zoekAdres = vi.hoisted(() => vi.fn());
vi.mock("@/lib/wws/opzoeken/opzoeken.functions", () => ({
  zoekAdres,
  zoekEnergielabel: vi.fn(),
}));

const N = DEFAULT_NORMEN as unknown as Normen;
const ADMIN = { id: "admin-1", naam: "Beheerder", email: "admin@x.nl" };

function renderEditor(
  tellingId: string | undefined,
  userId = ADMIN.id,
  roles: AppRole[] = ["admin", "member"],
) {
  const qc = new QueryClient();
  return render(
    // StrictMode buitenaan, zoals TanStack Start in development: alleen dan draait React
    // effecten twee keer (genest binnen een provider wordt alleen dubbel gerenderd)
    <StrictMode>
      <QueryClientProvider client={qc}>
        <TellingEditor
          tellingId={tellingId}
          userId={userId}
          bewerker={ADMIN}
          rechten={rechtenVan(roles)}
        />
      </QueryClientProvider>
    </StrictMode>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  store.maakAan.mockResolvedValue(undefined);
  store.bewaar.mockResolvedValue(undefined);
  store.versies.mockResolvedValue([]);
  klantenStore.lijst.mockResolvedValue([
    { id: "k1", naam: "Amstel Wonen", pves: [] },
    { id: "k2", naam: "Zeta Vastgoed", pves: [] },
  ]);
  store.voegVersieToe.mockImplementation(async (_id: string, v: { nr: number }) => ({
    ...v,
    id: "v" + String(v.nr).padStart(4, "0"),
  }));
});

describe("TellingEditor", () => {
  it("nieuwe telling: Opslaan maakt hem aan en zet ?id= in de adresbalk", async () => {
    renderEditor(undefined);
    fireEvent.click(await screen.findByRole("button", { name: "Overslaan voor nu" }));
    fireEvent.change(screen.getByLabelText("Straat"), { target: { value: "Da Costastraat" } });
    expect(screen.getByRole("status", { name: "Opslagstatus" })).toHaveTextContent(
      "Niet-opgeslagen wijzigingen",
    );

    fireEvent.click(screen.getByRole("button", { name: "Opslaan" }));
    await waitFor(() => expect(store.maakAan).toHaveBeenCalledTimes(1));
    const [id, doc] = store.maakAan.mock.calls[0]!;
    expect(doc.meta.adres).toBe("Da Costastraat");
    expect(store.bewaar).not.toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith({ to: "/wws", search: { id }, replace: true });
    await waitFor(() =>
      expect(screen.getByRole("status", { name: "Opslagstatus" })).toHaveTextContent(
        "Alles opgeslagen",
      ),
    );

    // tweede keer opslaan: nu een update van dezelfde telling
    fireEvent.change(screen.getByLabelText("Plaats"), { target: { value: "Amsterdam" } });
    fireEvent.click(screen.getByRole("button", { name: "Opslaan" }));
    await waitFor(() => expect(store.bewaar).toHaveBeenCalledWith(id, expect.anything()));
    expect(store.maakAan).toHaveBeenCalledTimes(1);
  });

  it("admin bewerkt de telling van een collega: bewaar (update), eigenaar blijft de collega", async () => {
    const s = nieuweTellingStaat("Anna");
    s.meta.adres = "Straat";
    const telling: Telling = {
      ...maakTellingDoc(s, N, null),
      id: "t-anna",
      ownerId: "anna",
      ownerNaam: "Anna",
      gewijzigdOp: "2026-10-14T10:00:00Z",
    };
    store.haal.mockResolvedValue(telling);

    renderEditor("t-anna");
    expect(await screen.findByText(/Telling van Anna/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Huisnummer"), { target: { value: "12" } });
    fireEvent.click(screen.getByRole("button", { name: "Opslaan" }));

    await waitFor(() => expect(store.bewaar).toHaveBeenCalledTimes(1));
    const [id, doc] = store.bewaar.mock.calls[0]!;
    expect(id).toBe("t-anna");
    expect(doc).not.toHaveProperty("owner_id");
    expect(doc.lastEditedBy).toEqual(ADMIN);
    expect(store.maakAan).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
  });

  it("versie vastleggen met een naam, en daarna een versie openen", async () => {
    renderEditor(undefined);
    fireEvent.click(await screen.findByRole("button", { name: "Overslaan voor nu" }));
    fireEvent.change(screen.getByLabelText("Straat"), { target: { value: "Straat" } });
    fireEvent.click(screen.getByRole("button", { name: "Versie vastleggen" }));
    fireEvent.change(screen.getByLabelText("Naam van de versie"), {
      target: { value: "Oplevering" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Vastleggen" }));

    await waitFor(() => expect(store.voegVersieToe).toHaveBeenCalledTimes(1));
    // eerst de telling (nieuw: insert), dan de versie
    expect(store.maakAan.mock.invocationCallOrder[0]!).toBeLessThan(
      store.voegVersieToe.mock.invocationCallOrder[0]!,
    );
    const [, v] = store.voegVersieToe.mock.calls[0]!;
    expect(v).toMatchObject({ nr: 1, notitie: "Oplevering" });
    expect(v.normen).toEqual(N);
    expect(await screen.findByText("Oplevering")).toBeInTheDocument();
    expect(screen.getByLabelText("Naam")).toHaveValue("Oplevering");

    fireEvent.change(screen.getByLabelText("Straat"), { target: { value: "Andere straat" } });
    vi.spyOn(window, "confirm").mockReturnValue(true);
    fireEvent.click(screen.getByRole("button", { name: "Openen" }));
    expect(screen.getByLabelText("Straat")).toHaveValue("Straat");
    expect(screen.getByRole("status", { name: "Opslagstatus" })).toHaveTextContent(
      "gebaseerd op versie 1",
    );
  });

  it("telling die niet bestaat of niet zichtbaar is", async () => {
    store.haal.mockResolvedValue(null);
    renderEditor("bestaat-niet");
    expect(await screen.findByText(/bestaat niet \(meer\)/)).toBeInTheDocument();
  });

  it("eigenaar kiezen en een nieuwe eigenaar toevoegen; klantId gaat mee bij opslaan", async () => {
    klantenStore.voegToe.mockResolvedValue({ id: "k9", naam: "Nieuw BV", pves: [] });
    renderEditor(undefined);
    fireEvent.click(await screen.findByRole("button", { name: "Overslaan voor nu" }));
    fireEvent.click(await screen.findByRole("button", { name: "Eigenaar: geen" }));
    fireEvent.click(await screen.findByRole("option", { name: "Zeta Vastgoed" }));
    expect(screen.getByRole("button", { name: "Eigenaar: Zeta Vastgoed" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Opslaan" }));
    await waitFor(() => expect(store.maakAan).toHaveBeenCalledTimes(1));
    expect(store.maakAan.mock.calls[0]![1].meta.klantId).toBe("k2");

    // nieuwe eigenaar: zoeken, toevoegen, meteen gekozen
    fireEvent.click(screen.getByRole("button", { name: "Eigenaar: Zeta Vastgoed" }));
    fireEvent.change(screen.getByLabelText("Zoek een eigenaar"), { target: { value: "Nieuw BV" } });
    fireEvent.click(
      screen.getByRole("button", { name: "+ ‘Nieuw BV’ toevoegen als nieuwe eigenaar" }),
    );
    await waitFor(() => expect(klantenStore.voegToe).toHaveBeenCalledWith("Nieuw BV"));
    expect(screen.getByRole("status", { name: "Opslagstatus" })).toHaveTextContent(
      "Niet-opgeslagen wijzigingen",
    );
  });

  function tellingVanAnna(): Telling {
    const s = nieuweTellingStaat("Anna");
    s.meta.adres = "Straat";
    return {
      ...maakTellingDoc(s, N, null),
      id: "t-anna",
      ownerId: "anna",
      ownerNaam: "Anna",
      gewijzigdOp: "2026-10-14T10:00:00Z",
    };
  }

  it("kijkrol: telling alleen bekijken — geen opslaan, velden uit; geen nieuwe telling", async () => {
    store.haal.mockResolvedValue(tellingVanAnna());
    const { unmount } = renderEditor("t-anna", "lezer-1", ["viewer"]);
    expect(await screen.findByRole("note", { name: "Alleen lezen" })).toHaveTextContent(
      "Je hebt een kijkrol",
    );
    expect(screen.queryByRole("button", { name: "Opslaan" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Versie vastleggen" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Delen" })).toBeNull();
    expect(screen.getByLabelText("Straat")).toBeDisabled();
    expect(screen.getAllByRole("button", { name: "Vertrek toevoegen" })[0]).toBeDisabled();
    expect(screen.getByRole("button", { name: "Verbeteradvies" })).toBeEnabled();
    unmount();

    renderEditor(undefined, "lezer-1", ["viewer"]);
    expect(screen.getByText(/Met de kijkrol kun je geen nieuwe telling maken/)).toBeInTheDocument();
    expect(store.maakAan).not.toHaveBeenCalled();
  });

  it("kijkrol: PDF van de werkversie en van een versie downloaden, zonder iets op te slaan", async () => {
    const t = tellingVanAnna();
    t.meta.naam = "TEST woning";
    store.haal.mockResolvedValue(t);
    const v = maakVersie(nieuweTellingStaat("Anna"), N, "Eerste", new Date("2026-03-04T10:00:00Z"));
    store.versies.mockResolvedValue([{ ...v, id: "v0001" }]);
    renderEditor("t-anna", "lezer-1", ["viewer"]);
    fireEvent.click(await screen.findByRole("button", { name: "PDF van huidige stand" }));
    await waitFor(() => expect(bewaar).toHaveBeenCalledTimes(1));
    expect(bewaar.mock.calls[0]![0]).toBe("WWS_TEST_woning_werkversie.pdf");
    expect(bewaar.mock.calls[0]![1]).toBeInstanceOf(Blob);
    fireEvent.click(screen.getByRole("button", { name: "PDF van versie 1" }));
    await waitFor(() => expect(bewaar).toHaveBeenCalledTimes(2));
    // een versie-PDF gebruikt de gegevens van die versie (hier zonder naam of adres), zoals de bron
    expect(bewaar.mock.calls[1]![0]).toBe("WWS_puntentelling_v1.pdf");
    expect(store.bewaar).not.toHaveBeenCalled();
    expect(store.maakAan).not.toHaveBeenCalled();
    expect(store.voegVersieToe).not.toHaveBeenCalled();
  });

  it("gedeelde telling: een collega kan hem bekijken, niet aanpassen of verder delen", async () => {
    store.haal.mockResolvedValue(tellingVanAnna());
    renderEditor("t-anna", "bob", ["member"]);
    expect(await screen.findByRole("note", { name: "Alleen lezen" })).toHaveTextContent(
      "Deze telling is met je gedeeld door Anna",
    );
    expect(screen.queryByRole("button", { name: "Opslaan" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Delen" })).toBeNull();
    expect(screen.getByLabelText("Huisnummer")).toBeDisabled();
    expect(screen.getByRole("status", { name: "Opslagstatus" })).toHaveTextContent("Alleen lezen");
  });

  it("delen: eigenaar ziet collega's behalve zichzelf, en kan delen en intrekken", async () => {
    const eigen = { ...tellingVanAnna(), ownerId: "anna" };
    store.haal.mockResolvedValue(eigen);
    delenStore.collegas.mockResolvedValue([
      { id: "anna", naam: "Anna", email: "anna@x.nl" },
      { id: "bob", naam: "Bob", email: "bob@x.nl" },
      { id: "cas", naam: "Cas", email: "cas@x.nl" },
    ]);
    delenStore.gedeeldMet.mockResolvedValue(["cas"]);
    delenStore.deel.mockResolvedValue(undefined);
    delenStore.ontdeel.mockResolvedValue(undefined);
    renderEditor("t-anna", "anna", ["member"]);

    fireEvent.click(await screen.findByRole("button", { name: "Delen" }));
    const bob = await screen.findByRole("checkbox", { name: /Bob/ });
    expect(screen.queryByRole("checkbox", { name: /Anna/ })).toBeNull();
    expect(screen.getByRole("checkbox", { name: /Cas/ })).toBeChecked();
    expect(delenStore.collegas).toHaveBeenCalledWith(false);

    fireEvent.click(bob);
    await waitFor(() => expect(delenStore.deel).toHaveBeenCalledWith("t-anna", "bob"));
    fireEvent.click(screen.getByRole("checkbox", { name: /Cas/ }));
    await waitFor(() => expect(delenStore.ontdeel).toHaveBeenCalledWith("t-anna", "cas"));
  });

  // ---------- PvE ----------
  const PVE: Pve = {
    id: "p1",
    naam: "Standaard",
    badkamer: {
      actief: true,
      san: {
        toiletStaand: 0,
        toiletHang: 1,
        wastafel: 2,
        meerpers: 0,
        douche: 1,
        bad: 1,
        badDouche: 0,
        eisenOk: true,
        voorz: { handdoekrad: "1" },
      },
    },
    toilet: { actief: true, toilet: { toilet: "hangend", fontein: true } },
  };

  /** Eigen telling, gekoppeld aan eigenaar k1 met actief PvE p1, met onbewerkte ruimten */
  function tellingMetPve(): Telling {
    const s = nieuweTellingStaat("Beheerder");
    s.meta = { ...s.meta, naam: "PvE-test", klantId: "k1", pveId: "p1" };
    s.input.vertrekken.push(
      { type: "slaapkamer", m2: 12, verwarmd: true },
      { type: "badkamer", m2: 5, verwarmd: true, fac: facDefault("badkamer", false) },
    );
    s.input.overig.push({
      type: "toilet",
      m2: 1.2,
      verwarmd: false,
      fac: facDefault("toilet", false),
    });
    return {
      ...maakTellingDoc(s, N, null),
      id: "t-pve",
      ownerId: ADMIN.id,
      ownerNaam: "Beheerder",
      gewijzigdOp: "2026-10-14T10:00:00Z",
    };
  }

  function metPve() {
    klantenStore.lijst.mockResolvedValue([{ id: "k1", naam: "Amstel Wonen", pves: [PVE] }]);
    store.haal.mockResolvedValue(tellingMetPve());
  }

  const opgeslagenInput = () => store.bewaar.mock.calls.at(-1)![1].input as WwsInput;

  it("PvE: type wijzigen in het formulier vult de ruimte stil aan; met de hand aanpassen haalt de markering weg", async () => {
    metPve();
    renderEditor("t-pve");
    await screen.findByRole("button", { name: "Eigenaar: Amstel Wonen" });
    // slaapkamer (eerste vertrek) wordt badkamer
    fireEvent.change(screen.getAllByLabelText("Soort ruimte")[0]!, {
      target: { value: "badkamer" },
    });
    expect(await screen.findAllByText(/Overgenomen uit het standaard PvE/)).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Opslaan" }));
    await waitFor(() => expect(store.bewaar).toHaveBeenCalledTimes(1));
    const fac = opgeslagenInput().vertrekken[0]!.fac;
    expect(fac).toEqual({ kind: "badkamer", san: PVE.badkamer!.san, uitPve: true });
    // de al bestaande, onbewerkte badkamer en toiletruimte zijn NIET stil aangepast
    expect(opgeslagenInput().vertrekken[1]!.fac).toEqual(facDefault("badkamer", false));
    expect(opgeslagenInput().overig[0]!.fac).toEqual(facDefault("toilet", false));

    // een voorziening van die badkamer met de hand wijzigen: markering weg
    fireEvent.change(screen.getAllByLabelText("Douche")[0]!, { target: { value: "2" } });
    expect(screen.queryByText(/Overgenomen uit het standaard PvE/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Opslaan" }));
    await waitFor(() => expect(store.bewaar).toHaveBeenCalledTimes(2));
    expect(opgeslagenInput().vertrekken[0]!.fac).not.toHaveProperty("uitPve");
  });

  it("PvE: 'Toepassen op telling' uit het verbeteradvies neemt de invoer ongewijzigd over", async () => {
    metPve();
    const t = tellingMetPve();
    const na = structuredClone(t.input);
    // wat het advies doet: extra toiletruimte en een badkamer, allebei op standaardwaarden
    na.overig.push({
      type: "toilet",
      m2: "1,2",
      verwarmd: false,
      fac: facDefault("toilet", false),
    });
    na.vertrekken.push({
      type: "badkamer",
      m2: 4,
      verwarmd: true,
      fac: facDefault("badkamer", false),
    });
    advies.input = na;
    renderEditor("t-pve");
    await screen.findByRole("button", { name: "Eigenaar: Amstel Wonen" });
    fireEvent.click(screen.getByRole("button", { name: "Advies toepassen (test)" }));
    fireEvent.click(screen.getByRole("button", { name: "Opslaan" }));
    await waitFor(() => expect(store.bewaar).toHaveBeenCalledTimes(1));
    expect(opgeslagenInput()).toEqual(na);
    expect(JSON.stringify(opgeslagenInput())).not.toContain("uitPve");
  });

  it("PvE: een versie openen neemt de invoer van die versie ongewijzigd over", async () => {
    metPve();
    const t = tellingMetPve();
    const v = maakVersie(
      {
        meta: t.meta,
        input: t.input,
        versieCount: 0,
        aantalVersies: 0,
        basedOn: null,
        createdAt: "",
      },
      N,
      "Oud",
    );
    store.versies.mockResolvedValue([{ ...v, id: "v0001" }]);
    renderEditor("t-pve");
    fireEvent.click(await screen.findByRole("button", { name: "Openen" }));
    fireEvent.click(screen.getByRole("button", { name: "Opslaan" }));
    await waitFor(() => expect(store.bewaar).toHaveBeenCalledTimes(1));
    expect(opgeslagenInput()).toEqual(v.input);
    expect(JSON.stringify(opgeslagenInput())).not.toContain("uitPve");
  });

  it("PvE: eigenaar kiezen vraagt om toepassen; alleen onbewerkte ruimten, met pveId", async () => {
    klantenStore.lijst.mockResolvedValue([{ id: "k1", naam: "Amstel Wonen", pves: [PVE] }]);
    const t = tellingMetPve();
    t.meta = { ...t.meta, klantId: "", pveId: "" };
    // de toiletruimte is al met de hand ingevuld
    t.input.overig[0]!.fac = { kind: "toilet", toilet: { toilet: "staand", fontein: true } };
    store.haal.mockResolvedValue(t);
    renderEditor("t-pve");
    fireEvent.click(await screen.findByRole("button", { name: "Eigenaar: geen" }));
    fireEvent.click(await screen.findByRole("option", { name: "Amstel Wonen" }));
    expect(await screen.findByText("PvE toepassen?")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Toepassen" }));
    fireEvent.click(screen.getByRole("button", { name: "Opslaan" }));
    await waitFor(() => expect(store.bewaar).toHaveBeenCalledTimes(1));
    const doc = store.bewaar.mock.calls[0]![1];
    expect(doc.meta).toMatchObject({ klantId: "k1", pveId: "p1" });
    expect(doc.input.vertrekken[1].fac).toEqual({
      kind: "badkamer",
      san: PVE.badkamer!.san,
      uitPve: true,
    });
    expect(doc.input.overig[0].fac).toEqual(t.input.overig[0]!.fac);
  });

  // ---------- indelingsadvies ----------
  it("indelingsadvies: toepassen neemt de variant precies over, koppelt eigenaar en PvE pas dan", async () => {
    klantenStore.lijst.mockResolvedValue([{ id: "k1", naam: "Amstel Wonen", pves: [PVE] }]);
    const t = tellingMetPve();
    t.meta = { ...t.meta, klantId: "", pveId: "" };
    t.input.vertrekken.push({ type: "woonkamer", m2: 30, verwarmd: true });
    store.haal.mockResolvedValue(t);
    const verwacht = toepassen(
      t.input,
      berekenVarianten(t.input, ruimtenUitTelling(t.input), PVE, "", N)[0]!,
    );
    renderEditor("t-pve");
    fireEvent.click(await screen.findByRole("button", { name: "Indelingsadvies" }));
    fireEvent.change(await screen.findByLabelText("Eigenaar"), { target: { value: "k1" } });
    expect(screen.getByLabelText(/Uitgangspunten \(PvE\)/)).toHaveValue("p1");
    fireEvent.click(screen.getByRole("button", { name: "Volgende stap →" }));
    fireEvent.click(screen.getByRole("button", { name: "Genereer varianten →" }));
    fireEvent.click(screen.getAllByRole("button", { name: "Toepassen op deze telling" })[0]!);
    // toepassen tekent eerst het blokkenschema (asynchroon; in jsdom is er geen canvas)
    expect(
      await screen.findByRole("status", { name: "Opslagstatus" }, { timeout: 3000 }),
    ).toHaveTextContent("Niet-opgeslagen wijzigingen");
    fireEvent.click(screen.getByRole("button", { name: "Opslaan" }));
    await waitFor(() => expect(store.bewaar).toHaveBeenCalledTimes(1));
    const doc = store.bewaar.mock.calls[0]![1];
    expect(doc.input).toEqual(verwacht);
    expect(JSON.stringify(doc.input)).not.toMatch(/_ind(Vast|Nieuw)/);
    expect(doc.meta).toMatchObject({ klantId: "k1", pveId: "p1" });
  });

  it("indelingsadvies: annuleren heeft geen bijwerking (eigenaar niet gekoppeld)", async () => {
    klantenStore.lijst.mockResolvedValue([{ id: "k1", naam: "Amstel Wonen", pves: [PVE] }]);
    const t = tellingMetPve();
    t.meta = { ...t.meta, klantId: "", pveId: "" };
    store.haal.mockResolvedValue(t);
    renderEditor("t-pve");
    fireEvent.click(await screen.findByRole("button", { name: "Indelingsadvies" }));
    fireEvent.change(await screen.findByLabelText("Eigenaar"), { target: { value: "k1" } });
    fireEvent.click(screen.getByRole("button", { name: "Volgende stap →" }));
    fireEvent.click(screen.getByRole("button", { name: "Genereer varianten →" }));
    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
    await waitFor(() =>
      expect(screen.queryByText("Indelingsadvies", { selector: "h2" })).toBeNull(),
    );
    expect(screen.getByRole("status", { name: "Opslagstatus" })).toHaveTextContent(
      "Alles opgeslagen",
    );
    expect(screen.getByRole("button", { name: "Eigenaar: geen" })).toBeInTheDocument();
  });

  describe("venster Nieuwe telling (#dlgNieuweTelling)", () => {
    it("Doorgaan: postcode en huisnummer ingevuld, adres meteen opgezocht; opsteller = gebruiker", async () => {
      zoekAdres.mockResolvedValue({ ok: true, data: { straat: "Damrak", plaats: "Amsterdam" } });
      renderEditor(undefined);
      expect(await screen.findByRole("heading", { name: "Nieuwe telling" })).toBeInTheDocument();
      fireEvent.change(screen.getByPlaceholderText("1234 AB"), { target: { value: "1012lg" } });
      fireEvent.change(screen.getByPlaceholderText("12 A"), { target: { value: "1 A" } });
      fireEvent.click(screen.getByRole("button", { name: "Doorgaan" }));
      await waitFor(() =>
        expect(zoekAdres).toHaveBeenCalledWith({ data: { postcode: "1012LG", huisnummer: "1" } }),
      );
      await waitFor(() => expect(screen.getByLabelText("Straat")).toHaveValue("Damrak"));
      expect(screen.getByLabelText("Postcode")).toHaveValue("1012 LG");
      expect(screen.getByLabelText("Huisnummer")).toHaveValue("1 A");
      expect(screen.getByLabelText("Plaats")).toHaveValue("Amsterdam");
      expect(screen.getByLabelText("Naam")).toHaveValue("Damrak 1 A, Amsterdam");
      fireEvent.click(screen.getByRole("button", { name: "Opslaan" }));
      await waitFor(() => expect(store.maakAan).toHaveBeenCalledTimes(1));
      expect(store.maakAan.mock.calls[0]![1].meta.opsteller).toBe(ADMIN.naam);
    });

    it("ongeldige invoer: melding van de bron, venster blijft open", async () => {
      renderEditor(undefined);
      fireEvent.change(await screen.findByPlaceholderText("1234 AB"), {
        target: { value: "1234" },
      });
      fireEvent.click(screen.getByRole("button", { name: "Doorgaan" }));
      expect(screen.getByRole("status", { name: "" })).toHaveTextContent(
        "Vul een geldige postcode (1234 AB) en huisnummer in, of klik op ‘Overslaan voor nu’.",
      );
      expect(screen.getByRole("heading", { name: "Nieuwe telling" })).toBeInTheDocument();
      expect(zoekAdres).not.toHaveBeenCalled();
    });

    it("Overslaan voor nu: lege telling, niets opgezocht; geen venster bij een bestaande telling of de kijkrol", async () => {
      const { unmount } = renderEditor(undefined);
      fireEvent.click(await screen.findByRole("button", { name: "Overslaan voor nu" }));
      await waitFor(() =>
        expect(screen.queryByRole("heading", { name: "Nieuwe telling" })).toBeNull(),
      );
      expect(screen.getByLabelText("Postcode")).toHaveValue("");
      expect(zoekAdres).not.toHaveBeenCalled();
      unmount();

      renderEditor(undefined, "lezer-1", ["viewer"]);
      expect(screen.queryByRole("heading", { name: "Nieuwe telling" })).toBeNull();
    });
  });

  describe("versies bijwerken, hernoemen, verwijderen", () => {
    function tellingMetVersie() {
      const s = nieuweTellingStaat("Anna");
      s.meta.adres = "Straat";
      const v = { ...maakVersie(s, N, "Eerste", new Date("2026-03-04T10:00:00Z")), id: "v0001" };
      const t: Telling = {
        ...maakTellingDoc({ ...s, versieCount: 1, aantalVersies: 1 }, N, null),
        id: "t-v",
        ownerId: ADMIN.id,
        ownerNaam: "Beheerder",
        gewijzigdOp: "2026-10-14T10:00:00Z",
      };
      store.haal.mockResolvedValue(t);
      store.versies.mockResolvedValue([v]);
      return v;
    }

    it("Opslaan op een werkversie gebaseerd op versie 1 werkt versie 1 bij", async () => {
      const v = tellingMetVersie();
      store.werkVersieBij.mockImplementation(async (_t: string, _v: string, patch: object) => ({
        ...v,
        ...patch,
      }));
      store.bewaar.mockResolvedValue(undefined);
      renderEditor("t-v");
      vi.spyOn(window, "confirm").mockReturnValue(true);
      fireEvent.click(await screen.findByRole("button", { name: "Openen" }));
      fireEvent.change(screen.getByLabelText("Straat"), { target: { value: "Nieuwe straat" } });
      fireEvent.click(screen.getByRole("button", { name: "Opslaan" }));
      await waitFor(() => expect(store.werkVersieBij).toHaveBeenCalledTimes(1));
      const [tid, vid, patch] = store.werkVersieBij.mock.calls[0]!;
      expect([tid, vid]).toEqual(["t-v", "v0001"]);
      expect(patch.meta.adres).toBe("Nieuwe straat");
      expect(patch.normen).toEqual(N);
      expect(patch.bewerktOp).toEqual(expect.any(String));
      await waitFor(() => expect(store.bewaar).toHaveBeenCalledTimes(1));
      expect(store.voegVersieToe).not.toHaveBeenCalled();
    });

    it("hernoemen: Enter bevestigt", async () => {
      const v = tellingMetVersie();
      store.werkVersieBij.mockResolvedValue({ ...v, notitie: "Na renovatie" });
      renderEditor("t-v");
      fireEvent.click(await screen.findByRole("button", { name: "Versie 1 hernoemen" }));
      const veld = screen.getByLabelText("Naam van de versie");
      expect(veld).toHaveValue("Eerste");
      fireEvent.change(veld, { target: { value: "Na renovatie" } });
      fireEvent.submit(veld.closest("form")!);
      await waitFor(() =>
        expect(store.werkVersieBij).toHaveBeenCalledWith("t-v", "v0001", {
          notitie: "Na renovatie",
        }),
      );
      expect(await screen.findByText("Na renovatie")).toBeInTheDocument();
    });

    it("verwijderen na bevestiging; aantal versies omlaag en telling opgeslagen", async () => {
      tellingMetVersie();
      store.verwijderVersie.mockResolvedValue(undefined);
      store.bewaar.mockResolvedValue(undefined);
      renderEditor("t-v");
      fireEvent.click(await screen.findByRole("button", { name: "Versie 1 verwijderen" }));
      expect(
        screen.getByText(/Versie 1 \(‘Eerste’\) definitief verwijderen\?/),
      ).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Verwijderen" }));
      await waitFor(() => expect(store.verwijderVersie).toHaveBeenCalledWith("t-v", "v0001"));
      await waitFor(() => expect(store.bewaar).toHaveBeenCalledTimes(1));
      expect(store.bewaar.mock.calls[0]![1].aantalVersies).toBe(0);
      expect(screen.queryByRole("button", { name: "Versie 1 verwijderen" })).toBeNull();
    });

    it("kijkrol: geen hernoemen of verwijderen", async () => {
      tellingMetVersie();
      renderEditor("t-v", "lezer-1", ["viewer"]);
      expect(await screen.findByRole("button", { name: "PDF van versie 1" })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Versie 1 hernoemen" })).toBeNull();
      expect(screen.queryByRole("button", { name: "Versie 1 verwijderen" })).toBeNull();
    });
  });

  describe("dupliceren en verwijderen vanuit de editor", () => {
    function eigenTelling(): Telling {
      const st = nieuweTellingStaat("Beheerder");
      st.meta.naam = "Woning A";
      st.meta.adres = "Straat";
      st.input.vertrekken.push({ type: "woonkamer", m2: 30, verwarmd: true });
      const t = {
        ...maakTellingDoc({ ...st, versieCount: 2, aantalVersies: 2 }, N, null),
        id: "t-a",
        ownerId: ADMIN.id,
        ownerNaam: "Beheerder",
        gewijzigdOp: "2026-10-14T10:00:00Z",
      };
      store.haal.mockResolvedValue(t);
      return t;
    }

    it("dupliceren: nieuwe telling '(kopie)' zonder versies; Opslaan maakt een nieuwe aan", async () => {
      eigenTelling();
      store.maakAan.mockResolvedValue(undefined);
      renderEditor("t-a");
      fireEvent.click(await screen.findByRole("button", { name: "Dupliceren" }));
      await waitFor(() => expect(screen.getByLabelText("Naam")).toHaveValue("Woning A (kopie)"));
      expect(screen.getByRole("status", { name: "Opslagstatus" })).toHaveTextContent(
        "Niet-opgeslagen wijzigingen",
      );
      expect(navigate).toHaveBeenCalledWith({ to: "/wws" });
      expect(screen.queryByRole("heading", { name: "Nieuwe telling" })).toBeNull();
      fireEvent.click(screen.getByRole("button", { name: "Opslaan" }));
      await waitFor(() => expect(store.maakAan).toHaveBeenCalledTimes(1));
      const [nieuwId, doc] = store.maakAan.mock.calls[0]!;
      expect(nieuwId).not.toBe("t-a");
      expect(doc).toMatchObject({ versieCount: 0, aantalVersies: 0, basedOn: null });
      expect(doc.input.vertrekken).toHaveLength(1);
      expect(store.bewaar).not.toHaveBeenCalled();
    });

    it("verwijderen na bevestiging, daarna naar het archief", async () => {
      eigenTelling();
      store.verwijder.mockResolvedValue(undefined);
      renderEditor("t-a");
      fireEvent.click(await screen.findByRole("button", { name: "Telling verwijderen" }));
      expect(
        screen.getByText(/‘Woning A’ en alle 2 opgeslagen versies worden definitief verwijderd/),
      ).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Verwijderen" }));
      await waitFor(() => expect(store.verwijder).toHaveBeenCalledWith("t-a"));
      await waitFor(() => expect(navigate).toHaveBeenCalledWith({ to: "/archief" }));
    });

    it("kijkrol en collega bij een gedeelde telling: geen dupliceren of verwijderen", async () => {
      eigenTelling();
      const { unmount } = renderEditor("t-a", "lezer-1", ["viewer"]);
      await screen.findByRole("note", { name: "Alleen lezen" });
      expect(screen.queryByRole("button", { name: "Dupliceren" })).toBeNull();
      expect(screen.queryByRole("button", { name: "Telling verwijderen" })).toBeNull();
      unmount();
      renderEditor("t-a", "bob", ["member"]);
      await screen.findByRole("note", { name: "Alleen lezen" });
      // een collega mag een gedeelde telling wel dupliceren (eigen kopie), niet verwijderen
      expect(screen.getByRole("button", { name: "Dupliceren" })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Telling verwijderen" })).toBeNull();
    });
  });

  describe("vergrendelde velden, opzoeklinks en uitleg", () => {
    it("adres automatisch overgenomen: alleen-lezen met 'wijzigen'; bouwjaar en woningtype ook", async () => {
      const st = nieuweTellingStaat("Beheerder");
      st.meta = {
        ...st.meta,
        adres: "Damrak",
        plaats: "Amsterdam",
        bouwjaar: "1975",
        postcode: "1012 LG",
        huisnummer: "1 A",
        auto: { adres: true, plaats: true, bouwjaar: true, woningtype: true },
      };
      store.haal.mockResolvedValue({
        ...maakTellingDoc(st, N, null),
        id: "t-auto",
        ownerId: ADMIN.id,
        ownerNaam: "Beheerder",
        gewijzigdOp: "2026-10-14T10:00:00Z",
      });
      renderEditor("t-auto");
      const straat = await screen.findByLabelText("Straat");
      expect(straat).toHaveAttribute("readonly");
      expect(screen.getAllByLabelText("Bouwjaar")[0]).toHaveAttribute("readonly");
      expect(screen.getByLabelText("Woningtype")).toBeDisabled();
      fireEvent.click(
        screen.getByRole("button", { name: "Straat zelf wijzigen (automatisch overgenomen)" }),
      );
      expect(screen.getByLabelText("Straat")).not.toHaveAttribute("readonly");
      expect(screen.getByLabelText("Plaats")).toHaveAttribute("readonly");
      expect(screen.getByRole("status", { name: "Opslagstatus" })).toHaveTextContent(
        "Niet-opgeslagen wijzigingen",
      );
      fireEvent.click(
        screen.getByRole("button", { name: "Woningtype zelf wijzigen (automatisch overgenomen)" }),
      );
      expect(screen.getByLabelText("Woningtype")).toBeEnabled();

      // opzoeklinks: WOZ met toevoeging, adres gekopieerd
      expect(screen.getAllByText("1012LG 1 A")).toHaveLength(2);
      const schrijf = vi.fn().mockResolvedValue(undefined);
      Object.assign(navigator, { clipboard: { writeText: schrijf } });
      fireEvent.click(screen.getByRole("link", { name: "EP-online ↗" }));
      await waitFor(() => expect(schrijf).toHaveBeenCalledWith("1012LG 1"));
      expect(
        await screen.findByText(
          /‘1012LG 1’ gekopieerd\. Plak het in het zoekveld van EP-online \(zonder toevoeging/,
          {
            selector: "[role=status]",
          },
        ),
      ).toBeInTheDocument();
      expect(screen.getByRole("link", { name: "WOZ-waardeloket ↗" })).toHaveAttribute(
        "href",
        "https://www.wozwaardeloket.nl/",
      );

      // uitleg bij een rubriek
      fireEvent.click(screen.getByRole("button", { name: "Uitleg: Buitenruimten" }));
      expect(await screen.findByText(/Een Frans balkon telt niet\./)).toBeInTheDocument();
    });
  });
});
