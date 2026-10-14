import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { AppHeader } from "@/components/AppHeader";
import Archief from "@/components/wws/Archief";
import { NormenProvider } from "@/components/wws/NormenContext";
import { normenQuery } from "@/components/wws/tellingStore";
import { myAccessQuery } from "@/lib/access";

export const Route = createFileRoute("/_authenticated/archief")({
  head: () => ({
    meta: [
      { title: "Archief — Werkplaats" },
      { name: "description", content: "Opgeslagen WWS-puntentellingen." },
    ],
  }),
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(myAccessQuery(context.user.id)),
      context.queryClient.ensureQueryData(normenQuery()),
    ]),
  component: ArchiefPage,
});

function ArchiefPage() {
  const { user } = Route.useRouteContext();
  const { data } = useSuspenseQuery(myAccessQuery(user.id));
  const { data: normen } = useSuspenseQuery(normenQuery());

  return (
    <div className="min-h-screen bg-background">
      <AppHeader isAdmin={data.isAdmin} heeftToegang={data.heeftToegang} />
      {data.heeftToegang ? (
        <NormenProvider normen={normen}>
          <Archief isAdmin={data.isAdmin} />
        </NormenProvider>
      ) : (
        <main className="mx-auto max-w-5xl px-6 py-16">
          <div className="max-w-lg rounded-xl border border-border bg-card p-8">
            <h1 className="font-display text-3xl text-foreground">Wachten op toegang</h1>
            <p className="mt-4 text-muted-foreground">
              Een beheerder moet je nog toegang geven voordat je het archief kunt gebruiken.
            </p>
          </div>
        </main>
      )}
    </div>
  );
}
