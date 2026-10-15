import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { tellingenQuery } from "./tellingStore";

/**
 * Startscherm van het indelingsadvies — toonIndelingStart() in wws-site.html: vanuit een
 * bestaande telling, of blanco vanaf een plattegrond. Alleen voor wie mag schrijven.
 */
export default function IndelingStart() {
  const navigate = useNavigate();
  const { data: tellingen } = useQuery(tellingenQuery());

  function bestaand() {
    if (tellingen && !tellingen.length) {
      toast(
        "Nog geen tellingen om een indeling voor te verkennen. Kies ‘Blanco — plattegrond uploaden’ om er zonder bestaande telling mee te beginnen.",
      );
      return;
    }
    void navigate({ to: "/archief", search: { indeling: true } });
  }

  return (
    <main className="mx-auto max-w-5xl px-6 py-12">
      <h1 className="text-2xl font-semibold tracking-tight">Indelingsadvies</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Begin je vanuit een bestaande telling, of helemaal blanco vanaf een plattegrond?
      </p>
      <div className="mt-4 flex max-w-sm flex-col gap-2.5">
        <Button onClick={bestaand}>Bestaande telling kiezen</Button>
        <Button
          variant="outline"
          onClick={() => void navigate({ to: "/wws", search: { blanco: true } })}
        >
          Blanco — plattegrond uploaden
        </Button>
      </div>
      <p className="mt-4 max-w-xl text-sm text-muted-foreground">
        Bij ‘Blanco’ wordt eerst een nieuwe, lege telling aangemaakt en lees je daar een plattegrond
        in (zoals bij ‘Plattegrond inlezen’); daarna ga je direct door naar het Indelingsadvies.
        Zodra je een variant toepast, heb je een complete puntentelling om verder af te maken.
      </p>
    </main>
  );
}
