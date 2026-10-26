import type { ReactNode } from "react";
import { MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export interface RijActie {
  label: string;
  onSelect: () => void;
  /** Onomkeerbaar (verwijderen): onderaan, apart, in de waarschuwingskleur */
  gevaar?: boolean;
}

/**
 * De knoppen achter een rij in het archief: de vaste acties (bv. "Bekijken", "PDF") als knop op
 * één regel, de overige in een menu "⋯". Zonder overige acties (kijkrol) is er geen menu.
 */
export function RijActies({
  naam,
  children,
  acties,
}: {
  /** Waar de rij over gaat, voor de naam van de menuknop ("Meer acties voor …") */
  naam: string;
  children?: ReactNode;
  acties: readonly (RijActie | false | null | undefined)[];
}) {
  const lijst = acties.filter((a): a is RijActie => !!a);
  const gewoon = lijst.filter((a) => !a.gevaar);
  const gevaar = lijst.filter((a) => a.gevaar);
  return (
    <div className="flex items-center justify-end gap-1 whitespace-nowrap">
      {children}
      {lijst.length > 0 && (
        // niet modaal: een venster dat vanuit het menu opent, krijgt dan gewoon de focus
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <Button
              size="sm"
              variant="ghost"
              className="px-2"
              aria-label={"Meer acties voor " + naam}
            >
              <MoreHorizontal className="size-4" aria-hidden />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="min-w-40 rounded-xl border-0 shadow-[var(--gh-shadow-popover)]"
          >
            {gewoon.map((a) => (
              <DropdownMenuItem key={a.label} onSelect={a.onSelect}>
                {a.label}
              </DropdownMenuItem>
            ))}
            {gewoon.length > 0 && gevaar.length > 0 && <DropdownMenuSeparator />}
            {gevaar.map((a) => (
              <DropdownMenuItem
                key={a.label}
                className="text-destructive focus:text-destructive"
                onSelect={a.onSelect}
              >
                {a.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}
