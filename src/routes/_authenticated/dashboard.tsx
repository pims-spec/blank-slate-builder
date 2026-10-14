import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { myAccessQuery } from "@/lib/access";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Overzicht — Werkplaats" },
      { name: "description", content: "Je persoonlijke overzicht in Werkplaats." },
      { property: "og:title", content: "Overzicht — Werkplaats" },
      { property: "og:description", content: "Je persoonlijke overzicht in Werkplaats." },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(myAccessQuery(context.user.id)),
  component: Dashboard,
});

function Dashboard() {
  const { user } = Route.useRouteContext();
  const { data } = useSuspenseQuery(myAccessQuery(user.id));
  const name = data.profile?.display_name ?? user.email;

  return (
    <div className="min-h-screen bg-background">
      <AppHeader isAdmin={data.isAdmin} heeftToegang={data.heeftToegang} />
      <main className="mx-auto max-w-5xl px-6 py-16">
        {data.heeftToegang ? (
          <>
            <p className="text-sm uppercase tracking-widest text-muted-foreground">Welkom terug</p>
            <h1 className="mt-2 font-display text-5xl text-foreground">{name}</h1>
            <p className="mt-6 max-w-lg text-muted-foreground">
              Je hebt toegang. Begin een nieuwe WWS-puntentelling.
            </p>
            <Button asChild className="mt-8">
              <Link to="/wws">Puntentelling openen</Link>
            </Button>
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
