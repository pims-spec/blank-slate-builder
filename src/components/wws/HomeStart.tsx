import { useQuery } from "@tanstack/react-query";
import { berekenHomeStats, dagdeelGroet, homeTegels } from "@/lib/wws/home";
import { dashboardVersiesQuery, tellingenQuery } from "./tellingStore";
import Uitleg from "./Uitleg";

/** .homehero in wws-site.html: groet en "Wat wil je doen?" in een lichte kaart */
export function HomeHero({ naam }: { naam: string }) {
  return (
    <div className="rounded-3xl border border-border bg-gradient-to-br from-secondary to-card px-8 py-9 shadow-[0_1px_2px_rgb(10_10_26/0.04),0_8px_24px_color-mix(in_oklab,var(--color-primary)_6%,transparent)] max-[720px]:px-5 max-[720px]:py-6">
      <h1 className="text-[46px] leading-[1.05] font-bold tracking-[-0.03em] text-foreground max-[720px]:text-3xl">
        {dagdeelGroet() + (naam ? ", " + naam : "")}
      </h1>
      <p className="tagline mt-1 text-[19px]">Wat wil je doen?</p>
    </div>
  );
}

/** .homestats: de eigen statistieken in één kaart — renderHomeStats() */
export function HomeStats({ userId }: { userId: string }) {
  const tellingen = useQuery(tellingenQuery());
  const versies = useQuery(dashboardVersiesQuery());
  // zoals de bron: lukt het ophalen van de versies niet, dan gewoon zonder adviezen
  if (!tellingen.data || versies.isPending) return null;
  const S = berekenHomeStats(tellingen.data, versies.data?.versies ?? [], userId);
  return (
    <section
      aria-label="Jouw statistieken"
      className="mt-5 grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-1 rounded-3xl border border-border bg-card px-2.5 py-4 shadow-[0_8px_24px_color-mix(in_oklab,var(--color-primary)_6%,transparent)]"
    >
      {homeTegels(S).map(([getal, label, uitleg]) => (
        <div key={label} className="px-3.5 py-2.5">
          <div className="text-[22px] leading-tight font-bold text-foreground">{getal}</div>
          <div className="mt-0.5 flex items-center gap-1 text-[11.5px] leading-snug text-muted-foreground">
            {label}
            {uitleg && <Uitleg tekst={uitleg} over={label} />}
          </div>
        </div>
      ))}
    </section>
  );
}
