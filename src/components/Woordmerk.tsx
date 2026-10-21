import { cn } from "@/lib/utils";

/**
 * Het woordmerk zoals "GoHome UI" in de huisstijlgids: "GoHome" halfvet, met "advice" licht en
 * grijs ernaast. Er is geen logo-afbeelding.
 */
export function Woordmerk({
  className,
  alleenG = false,
}: {
  className?: string;
  /** Smalle icoonbalk op telefoon: alleen de "G" */
  alleenG?: boolean;
}) {
  return (
    <span className={cn("inline-flex items-baseline gap-1.5 whitespace-nowrap", className)}>
      <span className="font-display text-[1.3em] font-semibold leading-none tracking-[-0.02em] text-foreground">
        {alleenG ? "G" : "GoHome"}
      </span>
      {!alleenG && <span className="font-normal text-muted-foreground">advice</span>}
      <span className="sr-only">{alleenG ? "GoHome advice" : ""}</span>
    </span>
  );
}
