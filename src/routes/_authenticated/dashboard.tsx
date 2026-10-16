import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Zijmenu, zijmenuRuimte } from "@/components/Zijmenu";
import { Button } from "@/components/ui/button";
import { HomeHero, HomeStats } from "@/components/wws/HomeStart";
import { normenQuery } from "@/components/wws/tellingStore";
import { myAccessQuery } from "@/lib/access";
import { controleStatus } from "@/lib/wws/opslag";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Overzicht — GoHome WWS" },
      { name: "description", content: "Je persoonlijke overzicht in GoHome WWS." },
      { property: "og:title", content: "Overzicht — GoHome WWS" },
      { property: "og:description", content: "Je persoonlijke overzicht in GoHome WWS." },
    ],
  }),
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(myAccessQuery(context.user.id)),
      context.queryClient.ensureQueryData(normenQuery()),
    ]),
  component: Dashboard,
});

function Dashboard() {
  const { user } = Route.useRouteContext();
  const { data } = useSuspenseQuery(myAccessQuery(user.id));
  const { data: normen } = useSuspenseQuery(normenQuery());
  const name = data.profile?.display_name ?? user.email;
  const controle = data.isAdmin ? controleStatus(normen.gecontroleerd) : null;

  return (
    <div className={"min-h-screen " + zijmenuRuimte}>
      <Zijmenu
        isAdmin={data.isAdmin}
        heeftToegang={data.heeftToegang}
        zietAlles={data.zietAlles}
        magSchrijven={data.magSchrijven}
      />
      <main className="mx-auto max-w-3xl px-6 py-11 max-[720px]:px-4 max-[720px]:py-6">
        {data.heeftToegang ? (
          <>
            <HomeHero naam={name ?? ""} />
            <HomeStats userId={user.id} />
            {data.isViewer ? (
              <>
                <p className="mt-6 max-w-lg text-muted-foreground">
                  Je hebt een kijkrol: je kunt alle tellingen bekijken, maar niets wijzigen.
                </p>
                <Button asChild className="mt-8">
                  <Link to="/archief">Archief bekijken</Link>
                </Button>
              </>
            ) : (
              <>
                <p className="mt-6 max-w-lg text-muted-foreground">
                  Deze tool helpt je met het optimaliseren van een woning.
                </p>
              </>
            )}
            {controle?.nodig && (
              <div className="mt-10 max-w-lg rounded-lg border border-amber-500/50 bg-amber-500/10 p-4 text-sm">
                <p className="font-medium">Tijd voor de maandelijkse controle van de normen</p>
                <p className="mt-1">{controle.reden}</p>
                <Button asChild variant="outline" size="sm" className="mt-3">
                  <Link to="/normen">Naar de normen</Link>
                </Button>
              </div>
            )}
          </>
        ) : (
          <div className="max-w-lg rounded-xl border border-border bg-card p-8">
            <h1 className="font-display text-3xl text-foreground">Wachten op toegang</h1>
            <p className="mt-4 text-muted-foreground">
              Je account ({user.email}) is aangemaakt. Een beheerder moet je nog toegang geven.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
