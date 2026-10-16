import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { Klant } from "@/lib/wws/opslag";
import { adresTekst } from "@/lib/wws/portefeuille/adres";
import { MAX_IMPORT, leesImport, type ImportUitkomst } from "@/lib/wws/portefeuille/importeren";
import { laadXlsx } from "@/lib/wws/pdf/laden";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  klanten: readonly Klant[];
  /** Adressen toevoegen aan deze portefeuille (anders een nieuwe) */
  bestaand: { id: string; naam: string } | null;
  onImporteer: (
    w: { naam: string; klantId: string | null },
    uitkomst: ImportUitkomst,
  ) => Promise<void>;
}

/** Adressen importeren uit Excel of CSV (postcode, huisnummer, toevoeging) */
export function ImportDialoog(p: Props) {
  return (
    <Dialog open={p.open} onOpenChange={p.onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{p.bestaand ? "Adressen toevoegen" : "Portefeuille importeren"}</DialogTitle>
          <DialogDescription>
            Een Excel- of CSV-bestand met de kolommen postcode, huisnummer en toevoeging (eventueel
            huisletter). Alleen deze gegevens worden opgeslagen.
          </DialogDescription>
        </DialogHeader>
        {p.open && <Inhoud {...p} />}
      </DialogContent>
    </Dialog>
  );
}

function Inhoud({ klanten, bestaand, onImporteer, onOpenChange }: Props) {
  const [naam, setNaam] = useState("");
  const [klantId, setKlantId] = useState("");
  const [u, setU] = useState<ImportUitkomst | null>(null);
  const [bezig, setBezig] = useState(false);

  async function leesBestand(f: File | undefined) {
    setU(null);
    if (!f) return;
    if (f.size > 10 * 1024 * 1024) {
      toast.error("Dit bestand is groter dan 10 MB.");
      return;
    }
    try {
      const XLSX = await laadXlsx();
      const wb = XLSX.read(new Uint8Array(await f.arrayBuffer()), { type: "array", raw: false });
      const blad = wb.Sheets[wb.SheetNames[0]!]!;
      const rijen = XLSX.utils.sheet_to_json<unknown[]>(blad, {
        header: 1,
        raw: false,
        defval: "",
      });
      setU(leesImport(rijen));
      if (!naam && !bestaand) setNaam(f.name.replace(/\.(xlsx|xls|csv)$/i, ""));
    } catch {
      toast.error("Dit bestand kon niet worden gelezen. Gebruik .xlsx of .csv.");
    }
  }

  const kan = !!u && !u.fout && u.adressen.length > 0 && (bestaand || naam.trim()) && !bezig;
  return (
    <div className="space-y-4 text-sm">
      {!bestaand && (
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1">
            <span className="text-muted-foreground">Naam van de portefeuille</span>
            <Input value={naam} maxLength={200} onChange={(e) => setNaam(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-muted-foreground">Eigenaar (optioneel)</span>
            <select
              className="h-9 rounded-xl border border-input bg-background px-2"
              value={klantId}
              onChange={(e) => setKlantId(e.target.value)}
            >
              <option value="">Geen eigenaar</option>
              {klanten.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.naam}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
      <label className="flex flex-col gap-1">
        <span className="text-muted-foreground">
          Bestand (.xlsx of .csv, max. {MAX_IMPORT} adressen)
        </span>
        <input
          type="file"
          accept=".xlsx,.xls,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          onChange={(e) => void leesBestand(e.target.files?.[0])}
        />
      </label>
      {u && (
        <div className="rounded-xl border border-border p-3" role="status">
          {u.fout === "geen_kop" ? (
            <p className="text-destructive">Geen kolommen ‘postcode’ en ‘huisnummer’ gevonden.</p>
          ) : u.fout === "leeg" ? (
            <p className="text-destructive">Er staan geen adressen in dit bestand.</p>
          ) : (
            <>
              <p>
                <b>{u.adressen.length}</b> adressen klaar om te importeren
                {u.adressen.length
                  ? ", bijv. " + u.adressen.slice(0, 3).map(adresTekst).join(", ")
                  : ""}
                .
              </p>
              {u.dubbel.length > 0 && (
                <p className="mt-1">{u.dubbel.length} dubbele rijen worden overgeslagen.</p>
              )}
              {u.teVeel > 0 && (
                <p className="mt-1 text-destructive">
                  {u.teVeel} rijen boven het maximum worden overgeslagen.
                </p>
              )}
              {u.ongeldig.length > 0 && (
                <details className="mt-1">
                  <summary>{u.ongeldig.length} rijen zijn ongeldig en worden overgeslagen</summary>
                  <ul className="mt-1 max-h-32 overflow-y-auto text-muted-foreground">
                    {u.ongeldig.map((o) => (
                      <li key={o.rij}>
                        Rij {o.rij}: {o.reden}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </>
          )}
        </div>
      )}
      <DialogFooter>
        <Button variant="outline" onClick={() => onOpenChange(false)}>
          Annuleren
        </Button>
        <Button
          disabled={!kan}
          onClick={async () => {
            setBezig(true);
            try {
              await onImporteer({ naam: naam.trim(), klantId: klantId || null }, u!);
              onOpenChange(false);
            } catch (e) {
              toast.error(
                "Importeren lukte niet: " + (e instanceof Error ? e.message : "onbekende fout"),
              );
            } finally {
              setBezig(false);
            }
          }}
        >
          {bezig ? "Bezig…" : "Importeren"}
        </Button>
      </DialogFooter>
    </div>
  );
}
