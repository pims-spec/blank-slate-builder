import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_NORMEN, type Normen } from "@/lib/wws";
import { maakTellingDoc, nieuweTellingStaat, type Telling } from "@/lib/wws/opslag";
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
vi.mock("./tellingStore", async () => {
  const { DEFAULT_NORMEN } = await import("@/lib/wws");
  return { NORMEN: DEFAULT_NORMEN, tellingStore: store };
});

const N = DEFAULT_NORMEN as unknown as Normen;
const ADMIN = { id: "admin-1", naam: "Beheerder", email: "admin@x.nl" };

function renderEditor(tellingId: string | undefined, userId = ADMIN.id) {
  const qc = new QueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <TellingEditor tellingId={tellingId} userId={userId} bewerker={ADMIN} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  store.maakAan.mockResolvedValue(undefined);
  store.bewaar.mockResolvedValue(undefined);
  store.versies.mockResolvedValue([]);
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
});
