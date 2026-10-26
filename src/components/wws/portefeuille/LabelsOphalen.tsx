import { useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { vandaag } from "@/lib/wws/portefeuille/datum";
import { stopMelding } from "@/lib/wws/portefeuille/ophalen";
import { MAX_PER_PORTIE, haalLabelsOp } from "@/lib/wws/portefeuille/portefeuille.functions";
import {
  bundel,
  haalInPorties,
  opnieuwLijst,
  perPortefeuille,
  type OphaalAdres,
  type OpnieuwKeuze,
  type Voortgang,
} from "@/lib/wws/portefeuille/ronde";
import { portefeuilleStore } from "../tellingStore";

/**
 * Energielabels ophalen bij EP-Online voor één of meer portefeuilles: de nog niet opgehaalde
 * adressen (of hervatten), of opnieuw een keuze. Een adres dat in meer portefeuilles staat telt
 * en gaat één keer; het resultaat komt bij elke portefeuille. Zonder schrijfrechten alleen de
 * aantallen.
 */
export function LabelsOphalen({
  doelen,
  userId,
  magSchrijven,
  perSeconde,
  geblokkeerd = false,
  onBezig,
  onStart,
  onKlaar,
  extraTelling,
  extraKnoppen,
  children,
}: {
  /** De adressen die meedoen (niet: niet meer in Bloxs of uit de analyse gehaald) */
  doelen: readonly OphaalAdres[];
  userId: string;
  magSchrijven: boolean;
  perSeconde: number;
  /** Ander werk is bezig (aanvullen, BAG): knoppen uit */
  geblokkeerd?: boolean;
  onBezig?: (bezig: boolean) => void;
  onStart?: () => void;
  /** Na het ophalen (ook na stoppen): de gegevens opnieuw laden */
  onKlaar: () => void;
  extraTelling?: ReactNode;
  extraKnoppen?: ReactNode;
  children?: ReactNode;
}) {
  const [voortgang, setVoortgang] = useState<Voortgang | null>(null);
  const [melding, setMelding] = useState("");
  const [opnieuw, setOpnieuw] = useState<OpnieuwKeuze>("probleem");
  const [slaOver, setSlaOver] = useState(true);
  const stoppen = useRef(false);

  const totaal = useMemo(() => bundel(doelen).length, [doelen]);
  const nogNiet = useMemo(() => bundel(doelen.filter((d) => !d.adres.resultaat)), [doelen]);
  const opnieuwBundels = useMemo(
    () => bundel(opnieuwLijst(doelen, opnieuw, vandaag(), slaOver)),
    [doelen, opnieuw, slaOver],
  );
  const uit = geblokkeerd || voortgang !== null;

  async function ophalen(bundels: ReturnType<typeof bundel>) {
    if (!bundels.length || uit) return;
    stoppen.current = false;
    setMelding("");
    onStart?.();
    onBezig?.(true);
    setVoortgang({ gedaan: 0, tot: 0, totaal: bundels.length });
    try {
      const r = await haalInPorties(bundels, {
        portie: MAX_PER_PORTIE,
        haalOp: (adressen) => haalLabelsOp({ data: { adressen } }),
        slaOp: async (rijen) => {
          for (const [id, l] of perPortefeuille(rijen))
            await portefeuilleStore.slaResultatenOp(
              id,
              userId,
              l.map(({ doel, resultaat }) => ({ id: doel.adres.id, resultaat })),
            );
        },
        voortgang: setVoortgang,
        moetStoppen: () => stoppen.current,
      });
      if (r.stop === "gestopt")
        setMelding(
          "Gestopt. Met ‘Hervatten’ gaat het ophalen verder bij de adressen zonder resultaat.",
        );
      else if (r.stop) setMelding(stopMelding(r.stop));
      else toast.success("Energielabels opgehaald (" + r.gedaan + ").");
    } finally {
      setVoortgang(null);
      onBezig?.(false);
      onKlaar();
    }
  }

  return (
    <section className="gh-card p-4" aria-label="Energielabels ophalen">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        <span>
          <b>{totaal}</b> adressen · <b>{totaal - nogNiet.length}</b> opgehaald
          {nogNiet.length > 0 && <> · {nogNiet.length} nog niet</>}
          {extraTelling}
        </span>
        {magSchrijven && (
          <div className="flex flex-wrap items-center gap-2">
            {voortgang ? (
              <Button variant="outline" onClick={() => (stoppen.current = true)}>
                Stoppen
              </Button>
            ) : (
              <>
                <Button disabled={uit || !nogNiet.length} onClick={() => void ophalen(nogNiet)}>
                  {totaal > nogNiet.length && nogNiet.length ? "Hervatten" : "Ophalen"} (
                  {nogNiet.length})
                </Button>
                <select
                  aria-label="Opnieuw ophalen: welke adressen"
                  className="h-9 max-w-full rounded-lg border border-transparent bg-muted px-2"
                  value={opnieuw}
                  onChange={(e) => setOpnieuw(e.target.value as OpnieuwKeuze)}
                >
                  <option value="probleem">Niet gevonden, niet eenduidig of mislukt</option>
                  <option value="oud">Ouder dan een maand</option>
                  <option value="alle">Alle adressen</option>
                </select>
                <Button
                  variant="outline"
                  disabled={uit || !opnieuwBundels.length}
                  onClick={() => void ophalen(opnieuwBundels)}
                >
                  Opnieuw ophalen ({opnieuwBundels.length})
                </Button>
                {opnieuw !== "probleem" && (
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={slaOver}
                      onChange={(e) => setSlaOver(e.target.checked)}
                    />
                    Labels die nog meer dan een jaar geldig zijn overslaan
                  </label>
                )}
                {extraKnoppen}
              </>
            )}
          </div>
        )}
      </div>
      {voortgang && (
        <div className="mt-3">
          <div
            className="h-2 overflow-hidden rounded-full bg-secondary"
            role="progressbar"
            aria-label="Voortgang ophalen"
            aria-valuemin={0}
            aria-valuemax={voortgang.totaal}
            aria-valuenow={voortgang.gedaan}
          >
            <div
              className="h-full bg-primary transition-all"
              style={{ width: (voortgang.gedaan / voortgang.totaal) * 100 + "%" }}
            />
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {voortgang.gedaan} van {voortgang.totaal} klaar
            {voortgang.tot > voortgang.gedaan &&
              ` · bezig met ${voortgang.gedaan + 1}–${voortgang.tot}`}{" "}
            · ongeveer {perSeconde} per seconde
          </p>
        </div>
      )}
      {melding && (
        <p className="mt-2 text-sm text-orange-ink" role="alert">
          {melding}
        </p>
      )}
      {children}
    </section>
  );
}
