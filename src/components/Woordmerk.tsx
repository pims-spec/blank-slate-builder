import { cn } from "@/lib/utils";

/**
 * Het woordmerk: "GoHome" vet en strak, met de tag "WWS" ernaast — .wordmark en .sm-tag in
 * wws-site.html (daar "advice"). De bron heeft geen logo-afbeelding.
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
      <span className="text-[1.6em] font-bold leading-none tracking-[-0.06em] text-foreground">
        {alleenG ? "G" : "GoHome"}
      </span>
      {!alleenG && <span className="font-medium tracking-wide text-muted-foreground">advice</span>}
      <span className="sr-only">{alleenG ? "GoHome advice" : ""}</span>
    </span>
  );
}
