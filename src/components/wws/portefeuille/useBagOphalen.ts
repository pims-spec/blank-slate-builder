import { useState } from "react";
import { toast } from "sonner";
import { MAX_PER_PORTIE, haalBagGegevens } from "@/lib/wws/portefeuille/portefeuille.functions";
import { bundel, haalInPorties, type OphaalAdres } from "@/lib/wws/portefeuille/ronde";
import { portefeuilleStore } from "../tellingStore";

/**
 * BAG-gegevens (oppervlakte, bouwjaar) ophalen bij PDOK in porties van 10, en opslaan; voor één
 * of meer portefeuilles (een adres in meer portefeuilles gaat één keer). `onKlaar` laadt daarna
 * de adressen opnieuw.
 */
export function useBagOphalen(onKlaar: () => void) {
  const [bezig, setBezig] = useState<{ gedaan: number; totaal: number } | null>(null);

  async function haal(lijst: readonly OphaalAdres[]) {
    const bundels = bundel(lijst);
    if (!bundels.length || bezig) return;
    setBezig({ gedaan: 0, totaal: bundels.length });
    try {
      const r = await haalInPorties(bundels, {
        portie: MAX_PER_PORTIE,
        haalOp: (adressen) => haalBagGegevens({ data: { adressen } }),
        slaOp: (rijen) =>
          portefeuilleStore.slaBagOp(
            rijen.map(({ doel, resultaat }) => ({ id: doel.adres.id, resultaat })),
          ),
        voortgang: (v) => setBezig({ gedaan: v.gedaan, totaal: v.totaal }),
      });
      if (r.stop === "geen_verbinding")
        toast.error("BAG-gegevens ophalen lukte niet. Probeer het opnieuw.");
      else if (r.stop)
        toast.error(
          r.stop === "te_veel_verzoeken"
            ? "De BAG (PDOK) geeft aan dat er te veel verzoeken zijn. Probeer het over een paar minuten opnieuw."
            : "De BAG (PDOK) is nu niet bereikbaar. Probeer het later opnieuw.",
        );
      else toast.success("BAG-gegevens opgehaald (" + r.gedaan + ").");
    } finally {
      setBezig(null);
      onKlaar();
    }
  }

  return { bezig, haal };
}
