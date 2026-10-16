import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Zijmenu, zijmenuRuimte } from "@/components/Zijmenu";
import PortefeuilleAnalyse from "@/components/wws/portefeuille/PortefeuilleAnalyse";
import { NormenProvider } from "@/components/wws/NormenContext";
import { normenQuery } from "@/components/wws/tellingStore";
import { myAccessQuery } from "@/lib/access";

export const Route = createFileRoute("/_authenticated/portefeuille-analyse")({
  head: () => ({
    meta: [
      { title: "Portefeuille-analyse — GoHome WWS" },
      { name: "description", content: "Energielabels per portefeuille: verlopen, verouderd, EFG." },
    ],
  }),
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(myAccessQuery(context.user.id)),
      context.queryClient.ensureQueryData(normenQuery()),
    ]),
  component: PortefeuilleAnalysePage,
});

function PortefeuilleAnalysePage() {
  const { user } = Route.useRouteContext();
  const { data } = useSuspenseQuery(myAccessQuery(user.id));
  const { data: normen } = useSuspenseQuery(normenQuery());

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
          <PortefeuilleAnalyse rechten={data} userId={user.id} />
        </NormenProvider>
      ) : (
        <main className="mx-auto max-w-5xl px-6 py-16">
          <div className="max-w-lg rounded-xl border border-border bg-card p-8">
            <h1 className="font-display text-3xl text-foreground">Wachten op toegang</h1>
            <p className="mt-4 text-muted-foreground">
              Een beheerder moet je nog toegang geven voordat je de portefeuille-analyse kunt
              gebruiken.
            </p>
          </div>
        </main>
      )}
    </div>
  );
}
