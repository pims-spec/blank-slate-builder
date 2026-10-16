import { Link, createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Zijmenu, zijmenuRuimte } from "@/components/Zijmenu";
import Archief from "@/components/wws/Archief";
import { ArchiefAnalyses } from "@/components/wws/portefeuille/ArchiefAnalyses";
import { NormenProvider } from "@/components/wws/NormenContext";
import { normenQuery } from "@/components/wws/tellingStore";
import { myAccessQuery } from "@/lib/access";

export const Route = createFileRoute("/_authenticated/archief")({
  // indeling: kiezen voor het indelingsadvies (vanaf /indeling)
  // tab: tellingen (standaard) of portefeuille-analyses
  validateSearch: z.object({
    indeling: z.boolean().optional(),
    tab: z.enum(["tellingen", "analyses"]).optional(),
  }),
  head: () => ({
    meta: [
      { title: "Archief — GoHome WWS" },
      {
        name: "description",
        content: "Opgeslagen WWS-puntentellingen en portefeuille-analyses.",
      },
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
  const { indeling, tab } = Route.useSearch();
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
          {tab === "analyses" && !indeling ? (
            <ArchiefAnalyses
              rechten={data}
              userId={user.id}
              tabs={<ArchiefTabs actief="analyses" />}
            />
          ) : (
            <Archief
              rechten={data}
              userId={user.id}
              voorIndeling={!!indeling}
              tabs={<ArchiefTabs actief="tellingen" />}
            />
          )}
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

function ArchiefTabs({ actief }: { actief: "tellingen" | "analyses" }) {
  const tab = (id: "tellingen" | "analyses", label: string) => (
    <Link
      to="/archief"
      search={id === "tellingen" ? {} : { tab: id }}
      role="tab"
      aria-selected={actief === id}
      className={
        "rounded-full px-3 py-1 text-sm " +
        (actief === id
          ? "bg-primary text-primary-foreground"
          : "text-muted-foreground hover:bg-secondary hover:text-foreground")
      }
    >
      {label}
    </Link>
  );
  return (
    <div role="tablist" aria-label="Archief" className="mt-2 flex flex-wrap gap-1">
      {tab("tellingen", "Tellingen")}
      {tab("analyses", "Portefeuille-analyses")}
    </div>
  );
}
