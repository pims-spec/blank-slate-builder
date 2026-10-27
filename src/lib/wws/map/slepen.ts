// Een map in het venster slepen: alle bestanden, ook in submappen, met hun pad. Gebruikt de
// FileSystemEntry-API van de browser (webkitGetAsEntry); bij "Map kiezen" (webkitdirectory) geeft
// de browser het pad zelf (webkitRelativePath).

export interface MapInvoer {
  pad: string;
  bestand: File;
}

/** Niet eindeloos diep of breed (een per ongeluk gesleepte schijf) */
const MAX_DIEPTE = 5;
const MAX_BESTANDEN = 500;

interface Entry {
  isFile: boolean;
  isDirectory: boolean;
  name: string;
}
interface FileEntry extends Entry {
  file(ok: (f: File) => void, fout: (e: unknown) => void): void;
}
interface DirEntry extends Entry {
  createReader(): { readEntries(ok: (e: Entry[]) => void, fout: (e: unknown) => void): void };
}

const bestandVan = (e: FileEntry) => new Promise<File>((ok, fout) => e.file(ok, fout));

/** readEntries geeft de inhoud in delen; lezen tot er niets meer komt */
async function inhoud(d: DirEntry): Promise<Entry[]> {
  const lezer = d.createReader();
  const uit: Entry[] = [];
  for (;;) {
    const deel = await new Promise<Entry[]>((ok, fout) => lezer.readEntries(ok, fout));
    if (!deel.length || uit.length > MAX_BESTANDEN) return uit;
    uit.push(...deel);
  }
}

/** De bestanden onder de gesleepte items (bestanden of mappen), met pad */
export async function leesGesleept(entries: readonly (Entry | null)[]): Promise<MapInvoer[]> {
  const uit: MapInvoer[] = [];
  async function loop(e: Entry, pad: string, diepte: number) {
    if (uit.length >= MAX_BESTANDEN) return;
    const hier = pad ? pad + "/" + e.name : e.name;
    if (e.isFile) {
      try {
        uit.push({ pad: hier, bestand: await bestandVan(e as FileEntry) });
      } catch {
        // onleesbaar bestand: overslaan
      }
    } else if (e.isDirectory && diepte < MAX_DIEPTE) {
      for (const k of await inhoud(e as DirEntry)) await loop(k, hier, diepte + 1);
    }
  }
  for (const e of entries) if (e) await loop(e, "", 0);
  return uit;
}

/** Uit een drop-event: de entries (synchroon ophalen, anders zijn ze weg na de eerste await) */
export function entriesVan(dt: DataTransfer): (Entry | null)[] {
  return [...dt.items]
    .filter((it) => it.kind === "file")
    .map((it) => it.webkitGetAsEntry() as Entry | null);
}

/** Uit "Map kiezen" (webkitdirectory) of gewone bestanden */
export function invoerVan(lijst: FileList | readonly File[]): MapInvoer[] {
  return [...lijst].map((f) => ({ pad: f.webkitRelativePath || f.name, bestand: f }));
}
