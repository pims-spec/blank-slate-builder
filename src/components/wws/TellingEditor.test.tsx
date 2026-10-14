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
    expect(screen.getByRole("status", { name: "Opslagstatus" })).toHaveTextContent(
      "Niet-opgeslagen wijzigingen",
    );
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
});
