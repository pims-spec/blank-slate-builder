import { describe, expect, it } from "vitest";
import { menuOnderdelen } from "./menu";

const labels = (r: Parameters<typeof menuOnderdelen>[0]) => {
  const m = menuOnderdelen(r);
  return [m.hoofd.map((x) => x.label), m.beheer.map((x) => x.label)];
};

describe("zijmenu: onderdelen per rol", () => {
  it("admin: alles, beheer onderaan", () => {
    expect(
      labels({ isAdmin: true, heeftToegang: true, zietAlles: true, magSchrijven: true }),
    ).toEqual([
      [
        "Overzicht",
        "Puntentelling",
        "Indelingsadvies",
        "Portefeuille-analyse",
        "Huurprijsindicator",
        "Archief",
        "Dashboard",
        "Eigenaren",
      ],
      ["Normen", "Gebruikers", "Beveiliging"],
    ]);
  });
  it("lid: geen dashboard en geen beheer (wel Beveiliging)", () => {
    expect(labels({ heeftToegang: true, magSchrijven: true })).toEqual([
      [
        "Overzicht",
        "Puntentelling",
        "Indelingsadvies",
        "Portefeuille-analyse",
        "Huurprijsindicator",
        "Archief",
        "Eigenaren",
      ],
      ["Beveiliging"],
    ]);
  });
  it("kijkrol: dashboard, geen indelingsadvies", () => {
    expect(labels({ heeftToegang: true, zietAlles: true })).toEqual([
      [
        "Overzicht",
        "Puntentelling",
        "Portefeuille-analyse",
        "Huurprijsindicator",
        "Archief",
        "Dashboard",
        "Eigenaren",
      ],
      ["Beveiliging"],
    ]);
  });
  it("nog geen toegang: alleen Overzicht", () => {
    expect(labels({ heeftToegang: false })).toEqual([["Overzicht"], ["Beveiliging"]]);
  });
});
