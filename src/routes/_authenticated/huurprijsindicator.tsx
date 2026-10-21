import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Zijmenu, zijmenuRuimte } from "@/components/Zijmenu";
import HuurprijsIndicator from "@/components/wws/HuurprijsIndicator";
import { NormenProvider } from "@/components/wws/NormenContext";
import { normenQuery } from "@/components/wws/tellingStore";
import { myAccessQuery } from "@/lib/access";

export const Route = createFileRoute("/_authenticated/huurprijsindicator")({
  // opnieuw: id van een opgeslagen indicatie (vanuit het archief) om opnieuw te berekenen
  validateSearch: z.object({ opnieuw: z.string().uuid().optional() }),
  head: () => ({
    meta: [
      { title: "Huurprijsindicator — GoHome WWS" },
      {
        name: "description",
        content: "Indicatieve markthuur per adres, met een check op de wettelijke maximale huur.",
      },
    ],
  }),
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(myAccessQuery(context.user.id)),
      context.queryClient.ensureQueryData(normenQuery()),
    ]),
  component: HuurprijsIndicatorPage,
});

function HuurprijsIndicatorPage() {
  const { user } = Route.useRouteContext();
  const { opnieuw } = Route.useSearch();
  const { data } = useSuspenseQuery(myAccessQuery(user.id));
  const { data: normen } = useSuspenseQuery(normenQuery());
  const email = user.email ?? "";

  return (
    <div className={"min-h-screen " + zijmenuRuimte}>
      <Zijmenu
        isAdmin={data.isAdmin}
        heeftToegang={data.heeftToegang}
        zietAlles={data.zietAlles}
        magSchrijven={data.magSchrijven}
      />
      {data.heeftToegang ? (
        <NormenProvider normen={normen}>
          <HuurprijsIndicator
            key={opnieuw ?? "nieuw"}
            magSchrijven={!!data.magSchrijven}
            opnieuwId={opnieuw}
            bewerker={{ id: user.id, naam: data.profile?.display_name || email, email }}
          />
        </NormenProvider>
      ) : (
        <main className="mx-auto max-w-5xl px-6 py-16">
          <div className="max-w-lg gh-card p-8">
            <h1 className="font-display text-[34px] leading-tight text-foreground max-[720px]:text-[28px]">
              Wachten op toegang
            </h1>
            <p className="mt-4 text-muted-foreground">
              Een beheerder moet je nog toegang geven voordat je de huurprijsindicator kunt
              gebruiken.
            </p>
          </div>
        </main>
      )}
    </div>
  );
}
