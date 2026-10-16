// De Bloxs-laag: de OData-feed van Bloxs ([klantomgeving].bloxs.io/odatafeed). Draait alleen op
// de server. De inloggegevens (BLOXS_ODATA_GEBRUIKER/-WACHTWOORD) gaan alleen als Basic-auth-
// header mee naar de feed zelf: nooit naar de browser, nooit in logs, en we volgen geen
// doorverwijzingen (zodat de header nooit bij een andere host terechtkomt). Fouten zijn vaste
// codes; een antwoord van Bloxs wordt nooit doorgegeven of gelogd.
import type { BloxsFout } from "./fouten";
import { leesMetadata, MAX_METADATA_TEKENS, type BloxsStructuur } from "./metadata";

export type { BloxsFout } from "./fouten";

export type BloxsUitkomst<T> = { ok: true; data: T } | { ok: false; fout: BloxsFout };

export interface BloxsConfig {
  basis: string;
  authorization: string;
}

const TIMEOUT_MS = 20_000;

/** Toegestane hosts: de klantomgevingen van Bloxs */
const HOST = /^[a-z0-9-]+(\.[a-z0-9-]+)*\.bloxs\.(io|com)$/;

/** Lees en controleer de secrets. Geeft nooit de waarden terug, alleen een kant-en-klare config. */
export function bloxsConfig(env: Record<string, string | undefined>): BloxsUitkomst<BloxsConfig> {
  const url = env["BLOXS_ODATA_URL"]?.trim();
  const gebruiker = env["BLOXS_ODATA_GEBRUIKER"];
  const wachtwoord = env["BLOXS_ODATA_WACHTWOORD"];
  if (!url || !gebruiker || !wachtwoord) return { ok: false, fout: "niet_ingesteld" };
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return { ok: false, fout: "url_ongeldig" };
  }
  if (u.protocol !== "https:" || !HOST.test(u.hostname) || u.username || u.password || u.search)
    return { ok: false, fout: "url_ongeldig" };
  const basis = u.origin + u.pathname.replace(/\/+$/, "");
  // Basic auth: gebruiker:wachtwoord als UTF-8, base64
  const bytes = new TextEncoder().encode(gebruiker + ":" + wachtwoord);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return { ok: true, data: { basis, authorization: "Basic " + btoa(bin) } };
}

/** Welke secrets er zijn (alleen ja/nee) */
export function bloxsSecretsAanwezig(env: Record<string, string | undefined>) {
  return {
    BLOXS_ODATA_URL: !!env["BLOXS_ODATA_URL"],
    BLOXS_ODATA_GEBRUIKER: !!env["BLOXS_ODATA_GEBRUIKER"],
    BLOXS_ODATA_WACHTWOORD: !!env["BLOXS_ODATA_WACHTWOORD"],
  };
}

export function foutVoorStatus(status: number): BloxsFout {
  if (status === 401 || status === 403) return "geweigerd";
  if (status === 404) return "niet_gevonden";
  if (status === 429) return "te_veel_verzoeken";
  if (status >= 500) return "niet_bereikbaar";
  return "onverwacht_antwoord";
}

function logFout(wat: string, fout: BloxsFout, status?: number) {
  // alleen wat en de code; nooit URL, inloggegevens of antwoord
  console.warn(`[bloxs] ${wat}: ${fout}${status ? ` (HTTP ${status})` : ""}`);
}

/**
 * Eén GET op de feed. `pad` is relatief aan de basis-URL ("$metadata", "" voor de servicelijst).
 * Geeft de tekst van het antwoord terug (begrensd), zonder die ooit te loggen.
 */
export async function haalBloxs(
  fetchFn: typeof fetch,
  cfg: BloxsConfig,
  pad: string,
  accept: string,
  wat: string,
  maxTekens: number,
): Promise<BloxsUitkomst<string>> {
  return haalBloxsUrl(fetchFn, cfg, cfg.basis + (pad ? "/" + pad : ""), accept, wat, maxTekens);
}

/** Als haalBloxs, met een volledige URL; die moet binnen onze eigen feed liggen */
export async function haalBloxsUrl(
  fetchFn: typeof fetch,
  cfg: BloxsConfig,
  url: string,
  accept: string,
  wat: string,
  maxTekens: number,
): Promise<BloxsUitkomst<string>> {
  if (url !== cfg.basis && !url.startsWith(cfg.basis + "/")) {
    logFout(wat, "onverwacht_antwoord");
    return { ok: false, fout: "onverwacht_antwoord" };
  }
  let res: Response;
  try {
    res = await fetchFn(url, {
      method: "GET",
      headers: { Authorization: cfg.authorization, Accept: accept },
      redirect: "manual",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    logFout(wat, "niet_bereikbaar");
    return { ok: false, fout: "niet_bereikbaar" };
  }
  if (!res.ok) {
    // 3xx (geen doorverwijzing volgen) en fouten: body niet lezen
    const fout =
      res.status >= 300 && res.status < 400 ? "onverwacht_antwoord" : foutVoorStatus(res.status);
    logFout(wat, fout, res.status);
    return { ok: false, fout };
  }
  const lengte = Number(res.headers.get("content-length") ?? "0");
  if (lengte > maxTekens * 4) {
    logFout(wat, "onverwacht_antwoord");
    return { ok: false, fout: "onverwacht_antwoord" };
  }
  let tekst: string;
  try {
    tekst = await res.text();
  } catch {
    logFout(wat, "niet_bereikbaar");
    return { ok: false, fout: "niet_bereikbaar" };
  }
  if (tekst.length > maxTekens) {
    logFout(wat, "onverwacht_antwoord");
    return { ok: false, fout: "onverwacht_antwoord" };
  }
  return { ok: true, data: tekst };
}

/** Verbinding testen: de servicelijst opvragen (alleen de status telt; de inhoud wordt niet gebruikt) */
export async function testBloxs(
  fetchFn: typeof fetch,
  cfg: BloxsConfig,
): Promise<BloxsUitkomst<true>> {
  const r = await haalBloxs(fetchFn, cfg, "", "*/*", "verbinding", 2_000_000);
  return r.ok ? { ok: true, data: true } : r;
}

/** De structuur van de feed: alleen namen van entiteiten en velden */
export async function bloxsStructuur(
  fetchFn: typeof fetch,
  cfg: BloxsConfig,
): Promise<BloxsUitkomst<BloxsStructuur>> {
  const r = await haalBloxs(
    fetchFn,
    cfg,
    "$metadata",
    "application/xml",
    "metadata",
    MAX_METADATA_TEKENS,
  );
  if (!r.ok) return r;
  const s = leesMetadata(r.data);
  if (!s) {
    logFout("metadata", "onverwacht_antwoord");
    return { ok: false, fout: "onverwacht_antwoord" };
  }
  return { ok: true, data: s };
}
