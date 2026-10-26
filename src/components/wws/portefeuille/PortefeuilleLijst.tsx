import { ChevronDown } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

/**
 * De portefeuilles van een gecombineerde analyse: dicht alleen "13 portefeuilles", uitgeklapt
 * elke portefeuille op een eigen regel (vanaf 9 in twee kolommen op een breed scherm, behalve
 * met `kolommen={false}`, zoals in een smalle tabelcel), net als in de PDF. Standaard dicht,
 * zodat een rij in het archief niet hoog wordt.
 */
export function PortefeuilleLijst({
  namen,
  className,
  kolommen = true,
}: {
  namen: readonly string[];
  className?: string;
  kolommen?: boolean;
}) {
  return (
    <Collapsible className={cn("text-xs text-muted-foreground", className)}>
      <CollapsibleTrigger className="group inline-flex items-center gap-1 rounded hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        {namen.length} portefeuilles
        <ChevronDown
          className="size-3.5 transition-transform group-data-[state=open]:rotate-180"
          aria-hidden
        />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <ul
          className={cn(
            "mt-1 list-disc space-y-0.5 pl-4 text-foreground",
            kolommen && namen.length > 8 && "sm:columns-2 sm:gap-6",
          )}
        >
          {namen.map((n, i) => (
            <li key={i} className="break-inside-avoid">
              {n}
            </li>
          ))}
        </ul>
      </CollapsibleContent>
    </Collapsible>
  );
}
