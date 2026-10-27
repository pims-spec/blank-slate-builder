import { describe, expect, it } from "vitest";
import { invoerVan, leesGesleept } from "./slepen";

const bestand = (name: string) => ({
  isFile: true,
  isDirectory: false,
  name,
  file: (ok: (f: File) => void) => ok(new File(["x"], name)),
});
/** Een map die zijn inhoud in delen van twee geeft, zoals Chrome dat doet bij grote mappen */
const map = (name: string, kinderen: object[]) => ({
  isFile: false,
  isDirectory: true,
  name,
  createReader: () => {
    let k = 0;
    return {
      readEntries: (ok: (e: object[]) => void) => {
        ok(kinderen.slice(k, k + 2));
        k += 2;
      },
    };
  },
});

describe("leesGesleept", () => {
  it("leest alle delen en submappen, met pad", async () => {
    const r = await leesGesleept([
      map("Woning", [
        bestand("a.jpg"),
        bestand("b.jpg"),
        bestand("c.jpg"),
        map("Tekening", [bestand("p.pdf")]),
      ]),
      bestand("los.jpg"),
      null,
    ] as never);
    expect(r.map((x) => x.pad)).toEqual([
      "Woning/a.jpg",
      "Woning/b.jpg",
      "Woning/c.jpg",
      "Woning/Tekening/p.pdf",
      "los.jpg",
    ]);
    expect(r[0]!.bestand.name).toBe("a.jpg");
  });
});

describe("invoerVan", () => {
  it("pad uit webkitRelativePath, anders de naam", () => {
    const f = new File(["x"], "a.jpg");
    Object.defineProperty(f, "webkitRelativePath", { value: "Woning/a.jpg" });
    expect(invoerVan([f, new File(["x"], "b.jpg")]).map((x) => x.pad)).toEqual([
      "Woning/a.jpg",
      "b.jpg",
    ]);
  });
});
