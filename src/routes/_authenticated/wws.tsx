import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { AppHeader } from "@/components/AppHeader";
import WwsCalculator from "@/components/wws/WwsCalculator";
import { myAccessQuery } from "@/lib/access";

export const Route = createFileRoute("/_authenticated/wws")({
  head: () => ({
    meta: [
      { title: "Puntentelling — Werkplaats" },
      { name: "description", content: "WWS-puntentelling voor zelfstandige woonruimte." },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(myAccessQuery(context.user.id)),
  component: WwsPage,
});

function WwsPage() {
  const { user } = Route.useRouteContext();
  const { data } = useSuspenseQuery(myAccessQuery(user.id));

  return (
    <div className="min-h-screen bg-background">
      <AppHeader isAdmin={data.isAdmin} />
      {data.isMember ? (
        <WwsCalculator />
      ) : (
        <main className="mx-auto max-w-5xl px-6 py-16">
          <div className="max-w-lg rounded-xl border border-border bg-card p-8">
            <h1 className="font-display text-3xl text-foreground">Wachten op toegang</h1>
            <p className="mt-4 text-muted-foreground">
              Een beheerder moet je nog toegang geven voordat je de puntentelling kunt gebruiken.
            </p>
          </div>
        </main>
      )}
    </div>
  );
}
