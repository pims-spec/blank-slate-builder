import { describe, expect, it } from "vitest";
import { effectieveRol, magTellingBewerken, rechtenVan, rolWijzigingen } from "./rollen";

describe("rollen", () => {
  it("effectieve rol: kijkrol wint, dan admin, dan member", () => {
    expect(effectieveRol([])).toBeNull();
    expect(effectieveRol(["member"])).toBe("member");
    expect(effectieveRol(["member", "admin"])).toBe("admin");
    expect(effectieveRol(["viewer"])).toBe("viewer");
    expect(effectieveRol(["admin", "viewer"])).toBe("viewer");
  });

  it("rechten per rol", () => {
    expect(rechtenVan([])).toMatchObject({ heeftToegang: false, magSchrijven: false });
    expect(rechtenVan(["member"])).toMatchObject({
      heeftToegang: true,
      magSchrijven: true,
      isAdmin: false,
      zietAlles: false,
    });
    expect(rechtenVan(["admin", "member"])).toMatchObject({
      magSchrijven: true,
      isAdmin: true,
      zietAlles: true,
    });
    expect(rechtenVan(["viewer"])).toMatchObject({
      heeftToegang: true,
      magSchrijven: false,
      isViewer: true,
      zietAlles: true,
    });
  });

  it("telling bewerken: eigenaar of admin, nooit de kijkrol of een ontvanger van een gedeelde telling", () => {
    const lid = rechtenVan(["member"]);
    expect(magTellingBewerken(lid, "u1", "u1")).toBe(true);
    expect(magTellingBewerken(lid, "u2", "u1")).toBe(false);
    expect(magTellingBewerken(rechtenVan(["admin"]), "u2", "u1")).toBe(true);
    expect(magTellingBewerken(rechtenVan(["viewer"]), "u1", "u1")).toBe(false);
  });

  it("rolwijzigingen: eerst weg, dan erbij; de kijkrol vervangt de andere rollen", () => {
    expect(rolWijzigingen([], "member")).toEqual({ verwijder: [], voegToe: ["member"] });
    expect(rolWijzigingen(["member"], "admin")).toEqual({ verwijder: [], voegToe: ["admin"] });
    expect(rolWijzigingen(["admin", "member"], "member")).toEqual({
      verwijder: ["admin"],
      voegToe: [],
    });
    expect(rolWijzigingen(["admin", "member"], "viewer")).toEqual({
      verwijder: ["admin", "member"],
      voegToe: ["viewer"],
    });
    expect(rolWijzigingen(["viewer"], "member")).toEqual({
      verwijder: ["viewer"],
      voegToe: ["member"],
    });
    expect(rolWijzigingen(["member"], null)).toEqual({ verwijder: ["member"], voegToe: [] });
  });
});
