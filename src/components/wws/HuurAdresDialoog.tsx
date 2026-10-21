import { useState } from "react";
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
import { huurAdresUit, type HuurAdres } from "@/lib/wws/huur/adres";
import { huurFoutMelding, type HuurOpzoeking } from "@/lib/wws/huur/opzoeken";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Opzoeken; bij succes sluit het venster */
  onZoek: (a: HuurAdres) => Promise<HuurOpzoeking | null>;
}

/** Postcode en huisnummer voor een nieuwe huurprijsindicatie, zoals bij een nieuwe telling */
export default function HuurAdresDialoog({ open, onOpenChange, onZoek }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        {open && <Inhoud onZoek={onZoek} onSluit={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function Inhoud({ onZoek, onSluit }: { onZoek: Props["onZoek"]; onSluit: () => void }) {
  const [postcode, setPostcode] = useState("");
  const [huisnummer, setHuisnummer] = useState("");
  const [info, setInfo] = useState("");
  const [keuzes, setKeuzes] = useState<string[]>([]);
  const [bezig, setBezig] = useState(false);

  async function zoek(a: HuurAdres) {
    setBezig(true);
    setInfo("Adres en woninggegevens opzoeken…");
    try {
      const r = await onZoek(a);
      if (!r) {
        setInfo(huurFoutMelding("geen_verbinding"));
        return;
      }
      if (!r.ok) {
        setKeuzes(r.keuzes ?? []);
        setInfo(huurFoutMelding(r.fout));
        return;
      }
      onSluit();
    } finally {
      setBezig(false);
    }
  }

  return (
    <form
      className="min-w-0 space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        const a = huurAdresUit(postcode, huisnummer);
        if (!a) {
          setInfo("Vul een geldige postcode (1234 AB) en huisnummer in.");
          return;
        }
        setKeuzes([]);
        void zoek(a);
      }}
    >
      <DialogHeader>
        <DialogTitle>Nieuwe huurprijsindicatie</DialogTitle>
        <DialogDescription>
          Vul de postcode en het huisnummer in; het adres, de oppervlakte, het bouwjaar en het
          energielabel worden dan automatisch opgezocht en ingevuld.
        </DialogDescription>
      </DialogHeader>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted-foreground">Postcode</span>
          <Input
            autoFocus
            placeholder="1234 AB"
            value={postcode}
            onChange={(e) => setPostcode(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted-foreground">Huisnummer + toevoeging</span>
          <Input
            placeholder="12 A"
            value={huisnummer}
            onChange={(e) => setHuisnummer(e.target.value)}
          />
        </label>
      </div>
      {keuzes.length > 0 && (
        <div className="text-sm" role="group" aria-label="Kies de woning">
          <span className="mr-2 text-muted-foreground">Kies:</span>
          {keuzes.map((k) => {
            const nr = huisnummer.trim().match(/^\d+/)?.[0] ?? "";
            return (
              <Button
                key={k}
                type="button"
                variant="outline"
                size="sm"
                className="mr-1 mb-1"
                disabled={bezig}
                onClick={() => {
                  setHuisnummer(nr + " " + k);
                  const a = huurAdresUit(postcode, nr + " " + k);
                  if (a) void zoek(a);
                }}
              >
                {nr} {k}
              </Button>
            );
          })}
        </div>
      )}
      <p className="min-h-5 text-sm text-muted-foreground" role="status">
        {info}
      </p>
      <DialogFooter className="gap-2">
        <Button type="button" variant="ghost" onClick={onSluit}>
          Annuleren
        </Button>
        <Button type="submit" disabled={bezig}>
          {bezig ? "Opzoeken…" : "Doorgaan"}
        </Button>
      </DialogFooter>
    </form>
  );
}
