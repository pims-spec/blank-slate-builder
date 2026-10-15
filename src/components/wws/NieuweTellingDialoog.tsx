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
import { NIEUWE_TELLING_ONGELDIG, nieuweTellingAdres } from "@/lib/wws/opzoeken/pdok";

interface Props {
  open: boolean;
  /** Doorgaan: postcode als "1234 AB", huisnummer zoals ingevuld */
  onDoorgaan: (postcode: string, huisnummer: string) => void;
  /** Overslaan voor nu (ook bij sluiten): lege nieuwe telling */
  onOverslaan: () => void;
}

/** Postcode en huisnummer bij een nieuwe telling — #dlgNieuweTelling in wws-site.html */
export default function NieuweTellingDialoog({ open, onDoorgaan, onOverslaan }: Props) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onOverslaan()}>
      <DialogContent className="max-w-md">
        {open && <Inhoud onDoorgaan={onDoorgaan} onOverslaan={onOverslaan} />}
      </DialogContent>
    </Dialog>
  );
}

function Inhoud({ onDoorgaan, onOverslaan }: Omit<Props, "open">) {
  const [postcode, setPostcode] = useState("");
  const [huisnummer, setHuisnummer] = useState("");
  const [info, setInfo] = useState("");
  const doorgaan = () => {
    const a = nieuweTellingAdres(postcode, huisnummer);
    if (!a) {
      setInfo(NIEUWE_TELLING_ONGELDIG);
      return;
    }
    onDoorgaan(a.postcode, a.huisnummer);
  };
  return (
    <form
      className="min-w-0 space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        doorgaan();
      }}
    >
      <DialogHeader>
        <DialogTitle>Nieuwe telling</DialogTitle>
        <DialogDescription>
          Vul de postcode en het huisnummer in; het adres en de plaats worden dan automatisch
          opgezocht.
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
      <p className="min-h-5 text-sm text-muted-foreground" role="status">
        {info}
      </p>
      <DialogFooter className="gap-2">
        <Button type="button" variant="outline" onClick={onOverslaan}>
          Overslaan voor nu
        </Button>
        <Button type="submit">Doorgaan</Button>
      </DialogFooter>
    </form>
  );
}
