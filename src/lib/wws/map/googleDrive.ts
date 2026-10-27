// Google Drive in de browser: de scripts van Google pas laden bij de eerste klik, een token vragen
// (Google Identity Services, scope drive.file), de Picker tonen en de gekozen bestanden downloaden.
// Het token blijft in het geheugen van deze module en wordt nergens opgeslagen. De antwoorden gaan
// door de zod-controles in drive.ts.
import {
  downloadUrl,
  DRIVE_SCOPE,
  leesPickerAntwoord,
  leesToken,
  PICKER_MIME,
  type DriveBestand,
  type DriveInstellingen,
} from "./drive";

// Alleen wat de app gebruikt van gapi en google.accounts / google.picker
interface Bouwer {
  addView(v: unknown): Bouwer;
  enableFeature(f: unknown): Bouwer;
  setOAuthToken(t: string): Bouwer;
  setDeveloperKey(k: string): Bouwer;
  setAppId(id: string): Bouwer;
  setLocale(l: string): Bouwer;
  setTitle(t: string): Bouwer;
  setCallback(cb: (data: unknown) => void): Bouwer;
  build(): { setVisible(v: boolean): void };
}
interface DocsView {
  setIncludeFolders(v: boolean): DocsView;
  setSelectFolderEnabled(v: boolean): DocsView;
  setMimeTypes(m: string): DocsView;
}
interface GoogleNs {
  accounts: {
    oauth2: {
      initTokenClient(c: {
        client_id: string;
        scope: string;
        callback: (r: unknown) => void;
        error_callback?: (e: unknown) => void;
      }): { requestAccessToken(o?: { prompt?: string }): void };
    };
  };
  picker: {
    DocsView: new (viewId: unknown) => DocsView;
    PickerBuilder: new () => Bouwer;
    ViewId: { DOCS: unknown };
    Feature: { MULTISELECT_ENABLED: unknown };
  };
}
type Win = Window & {
  gapi?: { load(n: string, cb: () => void): void };
  google?: Partial<GoogleNs>;
};

const scripts = new Map<string, Promise<void>>();
function laadScript(src: string): Promise<void> {
  let p = scripts.get(src);
  if (!p) {
    p = new Promise<void>((ok, fout) => {
      const s = document.createElement("script");
      s.src = src;
      s.async = true;
      s.onload = () => ok();
      s.onerror = () => {
        scripts.delete(src);
        fout(new Error("Google Drive kon niet worden geladen. Controleer de verbinding."));
      };
      document.head.appendChild(s);
    });
    scripts.set(src, p);
  }
  return p;
}

async function laadGoogle(): Promise<GoogleNs> {
  await Promise.all([
    laadScript("https://accounts.google.com/gsi/client"),
    laadScript("https://apis.google.com/js/api.js"),
  ]);
  const w = window as Win;
  if (!w.google?.picker) await new Promise<void>((ok) => w.gapi!.load("picker", ok));
  return w.google as GoogleNs;
}

let token: { waarde: string; tot: number } | null = null;

function vraagToken(g: GoogleNs, inst: DriveInstellingen): Promise<string> {
  if (token && token.tot > Date.now()) return Promise.resolve(token.waarde);
  return new Promise((ok, fout) => {
    const client = g.accounts.oauth2.initTokenClient({
      client_id: inst.clientId,
      scope: DRIVE_SCOPE,
      callback: (r) => {
        const t = leesToken(r);
        if (!t) return fout(new Error("Geen toegang tot Google Drive gekregen."));
        // Google geeft een uur; ruim daarvoor opnieuw vragen
        token = { waarde: t, tot: Date.now() + 50 * 60 * 1000 };
        ok(t);
      },
      error_callback: () => fout(new Error("Inloggen bij Google Drive is afgebroken.")),
    });
    client.requestAccessToken({ prompt: "" });
  });
}

/**
 * Inloggen bij Google (indien nodig) en de Picker tonen. Geeft de gekozen bestanden, of null bij
 * annuleren. In de Picker opent de gebruiker de map en selecteert alles (Cmd/Ctrl-A).
 */
export async function kiesUitDrive(
  inst: DriveInstellingen,
): Promise<{ bestanden: DriveBestand[]; token: string } | null> {
  const g = await laadGoogle();
  const t = await vraagToken(g, inst);
  return new Promise((ok) => {
    const view = new g.picker.DocsView(g.picker.ViewId.DOCS)
      .setIncludeFolders(true)
      .setSelectFolderEnabled(false)
      .setMimeTypes(PICKER_MIME);
    new g.picker.PickerBuilder()
      .addView(view)
      .enableFeature(g.picker.Feature.MULTISELECT_ENABLED)
      .setOAuthToken(t)
      .setDeveloperKey(inst.apiKey)
      .setAppId(inst.appId)
      .setLocale("nl")
      .setTitle("Open de map van de woning en selecteer alles (Cmd/Ctrl-A)")
      .setCallback((data) => {
        const r = leesPickerAntwoord(data);
        if (!r) return;
        ok(r.status === "gekozen" ? { bestanden: r.bestanden, token: t } : null);
      })
      .build()
      .setVisible(true);
  });
}

/** Eén bestand uit Drive als File (met de naam en het type uit de Picker) */
export async function downloadUitDrive(
  b: DriveBestand,
  t: string,
  signal: AbortSignal | null = null,
): Promise<File> {
  const res = await fetch(downloadUrl(b.id), {
    headers: { Authorization: "Bearer " + t },
    signal,
  });
  if (!res.ok) {
    if (res.status === 401) token = null;
    throw new Error(`${b.pad} kon niet uit Google Drive worden gehaald.`);
  }
  return new File([await res.blob()], b.pad, { type: b.type });
}
