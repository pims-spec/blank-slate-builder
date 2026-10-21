import { useQuery } from "@tanstack/react-query";
import { berekenHomeStats, dagdeelGroet, homeTegels } from "@/lib/wws/home";
import { dashboardVersiesQuery, tellingenQuery } from "./tellingStore";
import Uitleg from "./Uitleg";

/** Groet en "Wat wil je doen?" als hero direct op het canvas (GoHome UI: geen kaart om een titel) */
export function HomeHero({ naam }: { naam: string }) {
  return (
    <div className="pt-4 pb-2">
      <h1 className="font-display text-[46px] leading-[1.05] text-foreground max-[720px]:text-3xl">
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
      className="mt-5 grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-1 gh-card px-2.5 py-4"
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
