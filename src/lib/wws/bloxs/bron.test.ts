import { afterEach, describe, expect, it, vi } from "vitest";
import {
  bloxsConfig,
  bloxsSecretsAanwezig,
  bloxsStructuur,
  inlogMethoden,
  testBloxs,
} from "./bron";

const ENV = {
  BLOXS_ODATA_URL: "https://klant.bloxs.io/odatafeed/",
  BLOXS_ODATA_GEBRUIKER: "gebruiker@voorbeeld.nl",
  BLOXS_ODATA_WACHTWOORD: "geheim-wachtwoord-é",
};

const cfg = () => {
  const c = bloxsConfig(ENV);
  if (!c.ok) throw new Error("config");
  return c.data;
};

afterEach(() => vi.restoreAllMocks());

describe("bloxsConfig", () => {
  it("bouwt basis-URL en Basic-header (UTF-8)", () => {
    const c = cfg();
    expect(c.basis).toBe("https://klant.bloxs.io/odatafeed");
    const bin = atob(c.authorization.slice(6));
    const tekst = new TextDecoder().decode(Uint8Array.from(bin, (ch) => ch.charCodeAt(0)));
    expect(tekst).toBe("gebruiker@voorbeeld.nl:geheim-wachtwoord-é");
  });

  it("ontbrekende secrets", () => {
    expect(bloxsConfig({ ...ENV, BLOXS_ODATA_WACHTWOORD: "" })).toEqual({
      ok: false,
      fout: "niet_ingesteld",
    });
  });

  it.each([
    "http://klant.bloxs.io/odatafeed",
    "https://klant.bloxs.io.aanvaller.nl/odatafeed",
    "https://bloxs.io.nl/odatafeed",
    "https://user:pw@klant.bloxs.io/odatafeed",
    "https://klant.bloxs.io/odatafeed?x=1",
    "geen url",
  ])("weigert %s", (url) => {
    expect(bloxsConfig({ ...ENV, BLOXS_ODATA_URL: url })).toEqual({
      ok: false,
      fout: "url_ongeldig",
    });
  });

  it("aanwezigheid alleen als ja/nee", () => {
    expect(bloxsSecretsAanwezig({ BLOXS_ODATA_URL: "x" })).toEqual({
      BLOXS_ODATA_URL: true,
      BLOXS_ODATA_GEBRUIKER: false,
      BLOXS_ODATA_WACHTWOORD: false,
    });
  });
});

describe("aanroepen", () => {
  const xml = `<edmx:Edmx xmlns:edmx="x"><edmx:DataServices><Schema Namespace="N">
    <EntityType Name="Owner"><Property Name="Name"/></EntityType>
    <EntityContainer><EntitySet Name="Owners" EntityType="N.Owner"/></EntityContainer>
    </Schema></edmx:DataServices></edmx:Edmx>`;

  it("$metadata met Basic auth, zonder doorverwijzingen te volgen", async () => {
    const f = vi.fn(async () => new Response(xml, { status: 200 }));
    const r = await bloxsStructuur(f as unknown as typeof fetch, cfg());
    expect(r).toEqual({
      ok: true,
      data: {
        entiteiten: [
          { naam: "Owners", type: "N.Owner", sleutel: [], velden: ["Name"], navigatie: [] },
        ],
      },
    });
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://klant.bloxs.io/odatafeed/$metadata");
    expect(init.redirect).toBe("manual");
    expect((init.headers as Record<string, string>)["Authorization"]).toMatch(/^Basic /);
  });

  it.each([
    [401, "geweigerd"],
    [403, "geweigerd"],
    [404, "niet_gevonden"],
    [429, "te_veel_verzoeken"],
    [503, "niet_bereikbaar"],
    [302, "onverwacht_antwoord"],
    [400, "onverwacht_antwoord"],
  ])("HTTP %i → %s, zonder antwoord of geheimen in de log", async (status, fout) => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const body = "Fout bij gebruiker@voorbeeld.nl: details van de aanvraag";
    const f = vi.fn(async () => new Response(status === 302 ? null : body, { status }));
    expect(await testBloxs(f as unknown as typeof fetch, cfg())).toEqual({
      ok: false,
      fout,
      status,
    });
    const log = warn.mock.calls.flat().join(" ");
    expect(log).not.toContain("gebruiker");
    expect(log).not.toContain("geheim");
    expect(log).not.toContain("klant.bloxs.io");
    expect(log).not.toContain("details");
  });

  it("netwerkfout → niet_bereikbaar", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const f = vi.fn(async () => {
      throw new Error("connect ECONNREFUSED klant.bloxs.io gebruiker@voorbeeld.nl");
    });
    expect(await testBloxs(f as unknown as typeof fetch, cfg())).toEqual({
      ok: false,
      fout: "niet_bereikbaar",
    });
  });

  it("geen CSDL → onverwacht_antwoord", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const f = vi.fn(async () => new Response("<html>login</html>", { status: 200 }));
    expect(await bloxsStructuur(f as unknown as typeof fetch, cfg())).toEqual({
      ok: false,
      fout: "onverwacht_antwoord",
    });
  });
});

describe("inlogMethoden", () => {
  it("alleen de namen, zonder realm of andere parameters", () => {
    expect(inlogMethoden('Basic realm="omgeving x", charset="UTF-8"')).toEqual(["Basic"]);
    expect(inlogMethoden('Bearer error="invalid_token", Basic realm="a"')).toEqual([
      "Bearer",
      "Basic",
    ]);
    expect(inlogMethoden("Negotiate, NTLM")).toEqual(["Negotiate", "NTLM"]);
    expect(inlogMethoden(null)).toEqual([]);
  });
});

describe("testBloxs", () => {
  it("test de inlog met een gegevensvraag zonder rijen (servicelijst is openbaar)", async () => {
    const f = vi.fn(async () => new Response('{"value":[]}', { status: 200 }));
    expect(await testBloxs(f as unknown as typeof fetch, cfg())).toEqual({ ok: true, data: true });
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    const u = new URL(url);
    expect(u.pathname).toBe("/odatafeed/owners");
    expect(u.searchParams.get("$top")).toBe("0");
    expect(u.searchParams.get("$select")).toBe("OwnerId");
    expect((init.headers as Record<string, string>)["Authorization"]).toMatch(/^Basic /);
  });
});
