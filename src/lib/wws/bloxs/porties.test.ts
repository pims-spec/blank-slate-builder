import { describe, expect, it, vi } from "vitest";
import { adressenInPorties } from "./porties";
import type { BloxsAdres } from "./sync";

const adres = (id: number): BloxsAdres => ({ adresId: String(id), ok: false, ruw: "x" });

describe("adressen in porties", () => {
  it("porties van 20", async () => {
    const haal = vi.fn(async (ids: (string | number)[]) => ({
      ok: true as const,
      data: ids.map((i) => adres(Number(i))),
      aanvragen: 1,
    }));
    const r = await adressenInPorties(
      Array.from({ length: 45 }, (_, i) => i),
      haal,
    );
    expect(haal.mock.calls.map((c) => c[0].length)).toEqual([20, 20, 5]);
    expect(r).toMatchObject({ ok: true, aanvragen: 3 });
    expect(r.ok && r.data).toHaveLength(45);
  });

  it("HTTP 400: portie halveren tot het lukt", async () => {
    // de server weigert meer dan 6 ids per aanvraag
    const haal = vi.fn(async (ids: (string | number)[]) =>
      ids.length > 6
        ? { ok: false as const, fout: "onverwacht_antwoord" as const, status: 400, aanvragen: 1 }
        : { ok: true as const, data: ids.map((i) => adres(Number(i))), aanvragen: 1 },
    );
    const voortgang = vi.fn();
    const r = await adressenInPorties(
      Array.from({ length: 20 }, (_, i) => i),
      haal,
      { voortgang },
    );
    expect(haal.mock.calls.map((c) => c[0].length)).toEqual([20, 10, 5, 5, 10, 5, 5]);
    expect(r.ok && r.data.map((a) => a.adresId)).toEqual(
      Array.from({ length: 20 }, (_, i) => String(i)),
    );
    expect(r.aanvragen).toBe(7);
    expect(voortgang).toHaveBeenLastCalledWith(20, 20);
  });

  it("400 voor één adres, of een andere fout: stoppen met de status", async () => {
    const haal400 = vi.fn(async () => ({
      ok: false as const,
      fout: "onverwacht_antwoord" as const,
      status: 400,
      aanvragen: 1,
    }));
    expect(await adressenInPorties([1, 2], haal400)).toEqual({
      ok: false,
      fout: "onverwacht_antwoord",
      status: 400,
      aanvragen: 2, // [1,2] geweigerd, dan [1] geweigerd: stoppen
    });
    const haal429 = vi.fn(async () => ({
      ok: false as const,
      fout: "te_veel_verzoeken" as const,
      status: 429,
      aanvragen: 1,
    }));
    expect(await adressenInPorties([1, 2, 3], haal429)).toMatchObject({
      ok: false,
      fout: "te_veel_verzoeken",
      aanvragen: 1,
    });
  });

  it("stoppen tussen porties", async () => {
    let n = 0;
    const haal = vi.fn(async (ids: (string | number)[]) => ({
      ok: true as const,
      data: ids.map((i) => adres(Number(i))),
      aanvragen: 1,
    }));
    const r = await adressenInPorties([1, 2, 3], haal, { portie: 1, gestopt: () => n++ >= 1 });
    expect(r).toEqual({ ok: false, fout: "gestopt", aanvragen: 1 });
  });
});
