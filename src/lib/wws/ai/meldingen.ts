// Nederlandse meldingen bij de AI-functies — de teksten uit wws-site.html, aangepast aan Lovable
// en uitgebreid met de daglimiet. Nooit de foutmelding van de dienst zelf.
import type { AiServerFout } from "./ai.functions";
import type { Gebruik } from "./vragen";

export type AiMeldingSoort = "plattegrond" | "advies" | "afbeelding" | "foto";

export function aiMelding(
  fout: AiServerFout | "geen_verbinding",
  soort: AiMeldingSoort,
  gebruik?: Gebruik,
): string {
  const dienst =
    soort === "afbeelding" || soort === "foto" ? "GEMINI_API_KEY" : "ANTHROPIC_API_KEY";
  if (soort === "foto") {
    const m = fotoMelding(fout);
    if (m) return m;
  }
  switch (fout) {
    case "limiet_bereikt":
      return (
        "Je daglimiet voor " +
        (soort === "afbeelding" ? "AI-afbeeldingen" : "inlezen met AI") +
        " is bereikt" +
        (gebruik ? " (" + gebruik.gebruikt + " van " + gebruik.limiet + ")" : "") +
        ". Morgen kan het weer, of vraag een beheerder de limiet te verhogen (Normen)."
      );
    case "time_out":
      return soort === "advies"
        ? "Dit duurde te lang (meer dan 55 seconden) en is afgebroken. Probeer het nog eens, eventueel met een korter document."
        : "Dit duurde te lang (meer dan 55 seconden) en is afgebroken. Probeer het nog eens, eventueel met een eenvoudigere of kleinere tekening.";
    case "sleutel_ontbreekt":
    case "sleutel_ongeldig":
      return (
        "De server is nog niet (goed) ingesteld. Controleer of " +
        dienst +
        " in Lovable Cloud → Secrets is ingevuld."
      );
    case "te_veel_verzoeken":
      return soort === "afbeelding"
        ? "Limiet bereikt bij de AI-beeldendienst (mogelijk een quotum, niet per se tijdelijk). Probeer het later opnieuw."
        : "Even te veel verzoeken. Probeer het over een minuut opnieuw.";
    case "onbruikbaar_antwoord":
      return soort === "plattegrond"
        ? "Het antwoord was niet bruikbaar. Probeer het nog een keer, eventueel met een scherpere afbeelding."
        : soort === "advies"
          ? "Het antwoord was niet bruikbaar. Probeer het nog een keer."
          : "De AI-beeldendienst gaf geen bruikbare afbeelding terug. Probeer het nog eens.";
    case "afbeelding_geweigerd":
      return soort === "afbeelding"
        ? "De plattegrond-afbeelding werd niet geaccepteerd door de AI-beeldendienst."
        : "Deze afbeelding is te groot of wordt niet ondersteund.";
    case "geen_maatregelen":
      return "Er konden geen concrete energielabel-maatregelen uit dit document worden gehaald.";
    case "dienst_onbereikbaar":
      return "De AI-dienst is op dit moment niet bereikbaar. Probeer het later opnieuw.";
    case "geen_toegang":
      return "Je hebt geen toegang tot deze functie.";
    case "geen_verbinding":
      return "Kon geen verbinding maken met de server.";
  }
}

/** Eigen teksten voor de fotobeoordeling; null = de algemene tekst */
function fotoMelding(fout: AiServerFout | "geen_verbinding"): string | null {
  switch (fout) {
    case "time_out":
      return "Dit duurde te lang (meer dan 55 seconden) en is afgebroken. Probeer het nog eens, eventueel met minder foto's.";
    case "te_veel_verzoeken":
      return "Gemini is nu niet bereikbaar (te veel verzoeken of een quotum bij Google). Probeer het later opnieuw.";
    case "dienst_onbereikbaar":
      return "Gemini is nu niet bereikbaar. Probeer het later opnieuw.";
    case "onbruikbaar_antwoord":
      return "Het antwoord was onbruikbaar. Probeer het nog een keer, eventueel met scherpere foto's.";
    case "afbeelding_geweigerd":
      return "Een of meer foto's werden niet geaccepteerd. Probeer het met andere foto's.";
    default:
      return null;
  }
}

/** "3 van 30 vandaag gebruikt" */
export const gebruikTekst = (g: Gebruik | undefined) =>
  g ? g.gebruikt + " van " + g.limiet + " vandaag gebruikt" : "";
