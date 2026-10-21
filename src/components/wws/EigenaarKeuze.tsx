import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { bestaatKlant, klantNaam, zoekKlanten } from "@/lib/wws/opslag";
import { klantenQuery, klantenStore } from "./tellingStore";

interface Props {
  /** meta.klantId; leeg = geen eigenaar */
  klantId: string;
  onKies: (klantId: string) => void;
  alleenLezen?: boolean;
  /** Collega's mogen een nieuwe eigenaar toevoegen (de kijkrol niet) */
  magToevoegen?: boolean;
}

/**
 * Zoekbare eigenaar-keuze in de editor, gekoppeld aan meta.klantId — klantKeuzeHtml() en
 * renderKlantDropdown() in wws-site.html.
 */
export default function EigenaarKeuze({
  klantId,
  onKies,
  alleenLezen = false,
  magToevoegen = false,
}: Props) {
  const qc = useQueryClient();
  const { data: klanten = [] } = useQuery(klantenQuery());
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const zoekRef = useRef<HTMLInputElement>(null);
  const naam = klantNaam(klanten, klantId);
  const treffers = zoekKlanten(klanten, q);
  const nieuweNaam = q.trim();

  const toevoegen = useMutation({
    mutationFn: (n: string) => klantenStore.voegToe(n),
    onSuccess: (k) => {
      void qc.invalidateQueries({ queryKey: ["klanten"] });
      kies(k.id);
      toast.success("Eigenaar ‘" + k.naam + "’ toegevoegd");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function kies(id: string) {
    onKies(id);
    setOpen(false);
    setQ("");
  }

  const optieCls =
    "block w-full rounded-sm px-2 py-1.5 text-left text-sm hover:bg-muted focus:bg-muted focus:outline-none";

  return (
    <div className="flex flex-col gap-1 text-sm">
      <span className="text-muted-foreground">Eigenaar</span>
      <Popover open={open} onOpenChange={(o) => !alleenLezen && setOpen(o)}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            className="w-full min-w-0 justify-between gap-2 overflow-hidden border-transparent bg-muted font-normal hover:bg-muted"
            disabled={alleenLezen}
            aria-label={"Eigenaar: " + (naam || "geen")}
          >
            <span
              className={
                "min-w-0 flex-1 truncate text-left" + (naam ? "" : " text-muted-foreground")
              }
            >
              {naam || "Kies een eigenaar…"}
            </span>
            <span aria-hidden className="shrink-0">
              ▾
            </span>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80 p-2" align="start">
          <Input
            ref={zoekRef}
            autoFocus
            onKeyDown={(e) => {
              if (
                e.key === "Enter" &&
                magToevoegen &&
                nieuweNaam &&
                !bestaatKlant(klanten, nieuweNaam) &&
                !treffers.length
              ) {
                e.preventDefault();
                toevoegen.mutate(nieuweNaam);
              }
            }}
            aria-label="Zoek een eigenaar"
            placeholder="Zoek of kies een eigenaar…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <div className="mt-2 max-h-64 overflow-y-auto" role="listbox" aria-label="Eigenaren">
            <button
              type="button"
              role="option"
              aria-selected={!klantId}
              className={optieCls + " text-muted-foreground"}
              onClick={() => kies("")}
            >
              — Geen eigenaar —
            </button>
            {treffers.map((k) => (
              <button
                key={k.id}
                type="button"
                role="option"
                aria-selected={k.id === klantId}
                className={optieCls + (k.id === klantId ? " font-medium" : "")}
                onClick={() => kies(k.id)}
              >
                {k.naam}
              </button>
            ))}
            {!treffers.length && nieuweNaam && (
              <p className="px-2 py-1.5 text-xs text-muted-foreground">Geen eigenaar gevonden.</p>
            )}
          </div>
          {magToevoegen && (
            <div className="mt-2 border-t border-border pt-2">
              {nieuweNaam && !bestaatKlant(klanten, nieuweNaam) ? (
                <button
                  type="button"
                  className={optieCls + " text-primary"}
                  disabled={toevoegen.isPending}
                  onClick={() => toevoegen.mutate(nieuweNaam)}
                >
                  + ‘{nieuweNaam}’ toevoegen als nieuwe eigenaar
                </button>
              ) : (
                <button
                  type="button"
                  className={optieCls + " text-primary"}
                  onClick={() => zoekRef.current?.focus()}
                >
                  + Nieuwe eigenaar toevoegen
                  <span className="block text-xs text-muted-foreground">
                    Typ de naam hierboven en klik daarna op toevoegen.
                  </span>
                </button>
              )}
            </div>
          )}
          <div hidden></div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
