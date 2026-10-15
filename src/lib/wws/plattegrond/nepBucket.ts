// Nep-Storage-bucket voor tests: bestanden in een Map, met een log van de aanroepen.
import type { Bucket } from "./opslag";

export function nepBucket(fouten: Partial<Record<keyof Bucket, unknown>> = {}) {
  const bestanden = new Map<string, { blob: Blob; contentType: string }>();
  const log: [keyof Bucket, unknown[]][] = [];
  const bucket: Bucket = {
    async upload(pad, body, opties) {
      log.push(["upload", [pad, opties]]);
      if (fouten.upload) return { error: fouten.upload };
      if (bestanden.has(pad) && !opties.upsert) return { error: { message: "bestaat al" } };
      bestanden.set(pad, { blob: body, contentType: opties.contentType });
      return { error: null };
    },
    async download(pad) {
      log.push(["download", [pad]]);
      if (fouten.download) return { data: null, error: fouten.download };
      return { data: bestanden.get(pad)?.blob ?? null, error: null };
    },
    async list(map, opties) {
      log.push(["list", [map, opties]]);
      if (fouten.list) return { data: null, error: fouten.list };
      const namen = [...bestanden.keys()]
        .filter((p) => p.startsWith(map + "/"))
        .map((p) => ({ name: p.slice(map.length + 1) }));
      return { data: namen.slice(opties.offset, opties.offset + opties.limit), error: null };
    },
    async remove(paden) {
      log.push(["remove", [paden]]);
      if (fouten.remove) return { error: fouten.remove };
      paden.forEach((p) => bestanden.delete(p));
      return { error: null };
    },
  };
  return { bucket, bestanden, log };
}
