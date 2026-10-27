import { describe, expect, it } from "vitest";
import { downloadUrl, driveInstellingen, leesPickerAntwoord, leesToken } from "./drive";

const ID = "1AbC_dEf-GhIjKlMnOp";

describe("driveInstellingen", () => {
  const goed = {
    VITE_GOOGLE_CLIENT_ID: "123-abc.apps.googleusercontent.com",
    VITE_GOOGLE_API_KEY: "AIzaSyA-abcdefghijklmnopqrstuv",
    VITE_GOOGLE_APP_ID: "123456789012",
  };
  it("compleet en geldig → instellingen", () => {
    expect(driveInstellingen(goed)).toEqual({
      clientId: goed.VITE_GOOGLE_CLIENT_ID,
      apiKey: goed.VITE_GOOGLE_API_KEY,
      appId: goed.VITE_GOOGLE_APP_ID,
    });
  });
  it("ontbrekend of vreemd → null (de Drive-knop blijft weg)", () => {
    expect(driveInstellingen({})).toBeNull();
    expect(driveInstellingen({ ...goed, VITE_GOOGLE_APP_ID: "" })).toBeNull();
    expect(driveInstellingen({ ...goed, VITE_GOOGLE_CLIENT_ID: "iets" })).toBeNull();
    expect(driveInstellingen({ ...goed, VITE_GOOGLE_API_KEY: "kort" })).toBeNull();
  });
});

describe("leesPickerAntwoord", () => {
  it("gekozen: bestanden met pad, type en grootte; mappen, dubbele en vreemde ids vallen weg", () => {
    const r = leesPickerAntwoord({
      action: "picked",
      docs: [
        { id: ID, name: "keuken.jpg", mimeType: "image/jpeg", sizeBytes: "2048", url: "x" },
        { id: ID, name: "keuken.jpg", mimeType: "image/jpeg" },
        { id: "1Map_abcdefghij", name: "Woning", mimeType: "application/vnd.google-apps.folder" },
        { id: "../../etc", name: "x.jpg", mimeType: "image/jpeg" },
        { id: "2AbC_dEf-GhIjKlMnOp", name: "a/b.pdf", mimeType: "application/pdf" },
        "onzin",
      ],
    });
    expect(r).toEqual({
      status: "gekozen",
      bestanden: [
        { id: ID, pad: "keuken.jpg", type: "image/jpeg", grootte: 2048 },
        { id: "2AbC_dEf-GhIjKlMnOp", pad: "a-b.pdf", type: "application/pdf", grootte: 0 },
      ],
    });
  });
  it("geannuleerd; tussenberichten en onzin → null", () => {
    expect(leesPickerAntwoord({ action: "cancel" })).toEqual({ status: "geannuleerd" });
    expect(leesPickerAntwoord({ action: "loaded" })).toBeNull();
    expect(leesPickerAntwoord(null)).toBeNull();
  });
});

describe("downloadUrl en leesToken", () => {
  it("alleen een geldig id in de URL", () => {
    expect(downloadUrl(ID)).toBe(`https://www.googleapis.com/drive/v3/files/${ID}?alt=media`);
    expect(() => downloadUrl("../x?y")).toThrow();
  });
  it("token of null", () => {
    expect(leesToken({ access_token: "ya29.abcdefghij" })).toBe("ya29.abcdefghij");
    expect(leesToken({ error: "access_denied" })).toBeNull();
    expect(leesToken({ access_token: 5 })).toBeNull();
    expect(leesToken(undefined)).toBeNull();
  });
});
