import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { legeMeta } from "@/lib/wws/opslag/doc";
import MonumentOpzoeken from "./MonumentOpzoeken";

const zoekMonument = vi.hoisted(() => vi.fn());
vi.mock("@/lib/wws/opzoeken/opzoeken.functions", () => ({ zoekMonument }));
afterEach(() => zoekMonument.mockReset());

const meta = () => ({ ...legeMeta(), postcode: "1015 CJ", huisnummer: "123" });

describe("MonumentOpzoeken", () => {
  it("rijksmonument en stadsgezicht: link naar het register; overnemen pas na een klik", async () => {
    zoekMonument.mockResolvedValue({
      ok: true,
      data: {
        adres: "Keizersgracht 123, 1015CJ Amsterdam",
        rijksmonument: true,
        rijksmonumentNummers: ["2249"],
        gemeentelijkMonument: false,
        gezichten: ["Amsterdam - Binnen de Singelgracht"],
        voorstel: "rijks",
      },
    });
    const zetKeuze = vi.fn();
    render(<MonumentOpzoeken meta={meta()} keuze="geen" zetKeuze={zetKeuze} />);
    fireEvent.click(screen.getByRole("button", { name: /Monumentstatus opzoeken/ }));
    expect(await screen.findByRole("link", { name: "nr. 2249" })).toHaveAttribute(
      "href",
      "https://monumentenregister.cultureelerfgoed.nl/monumenten/2249",
    );
    expect(screen.getByText(/Amsterdam - Binnen de Singelgracht/)).toBeInTheDocument();
    expect(zoekMonument).toHaveBeenCalledWith({
      data: { postcode: "1015CJ", huisnummer: "123", huisletter: "", huisnummertoevoeging: "" },
    });
    expect(zetKeuze).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Rijksmonument, contract na 1 juli 2024" }));
    expect(zetKeuze).toHaveBeenCalledWith("rijks_na");
    expect(
      screen.getByRole("button", { name: "Beschermd stads- en dorpsgezicht" }),
    ).toBeInTheDocument();
  });

  it("niets gevonden: melding over provinciale en gemeentelijke stadsgezichten, geen knoppen", async () => {
    zoekMonument.mockResolvedValue({
      ok: true,
      data: {
        adres: "Da Costastraat 49-2, 1053ZD Amsterdam",
        rijksmonument: false,
        rijksmonumentNummers: [],
        gemeentelijkMonument: false,
        gezichten: [],
        voorstel: null,
      },
    });
    render(<MonumentOpzoeken meta={meta()} keuze="geen" zetKeuze={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /Monumentstatus opzoeken/ }));
    expect(await screen.findByText(/Provinciale monumenten/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Gemeentelijk monument/ })).toBeNull();
  });

  it("fout of geen adres: vaste melding", async () => {
    zoekMonument.mockResolvedValue({ ok: false, fout: "te_veel_verzoeken" });
    const { unmount } = render(<MonumentOpzoeken meta={meta()} keuze="geen" zetKeuze={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /Monumentstatus opzoeken/ }));
    expect(await screen.findByText(/te veel verzoeken/)).toBeInTheDocument();
    unmount();
    render(<MonumentOpzoeken meta={legeMeta()} keuze="geen" zetKeuze={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /Monumentstatus opzoeken/ }));
    expect(screen.getByText(/geldige postcode en huisnummer/)).toBeInTheDocument();
    expect(zoekMonument).toHaveBeenCalledTimes(1);
  });
});
