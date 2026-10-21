import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Zijmenu, zijmenuRuimte } from "@/components/Zijmenu";
import IndelingStart from "@/components/wws/IndelingStart";
import { myAccessQuery } from "@/lib/access";

export const Route = createFileRoute("/_authenticated/indeling")({
  head: () => ({
    meta: [
      { title: "Indelingsadvies — GoHome WWS" },
      { name: "description", content: "Indelingsadvies vanuit een telling of een plattegrond." },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(myAccessQuery(context.user.id)),
  component: IndelingPage,
});

function IndelingPage() {
  const { user } = Route.useRouteContext();
  const { data } = useSuspenseQuery(myAccessQuery(user.id));

  return (
    <div className={"min-h-screen " + zijmenuRuimte}>
      <Zijmenu
        isAdmin={data.isAdmin}
        heeftToegang={data.heeftToegang}
        zietAlles={data.zietAlles}
        magSchrijven={data.magSchrijven}
      />
      {data.magSchrijven ? (
        <IndelingStart />
      ) : (
        <main className="mx-auto max-w-5xl px-6 py-16">
          <div className="max-w-lg gh-card p-8">
            <h1 className="font-display text-[34px] leading-tight text-foreground max-[720px]:text-[28px]">
              Indelingsadvies
            </h1>
            <p className="mt-4 text-muted-foreground">
              {data.heeftToegang
                ? "Je hebt een kijkrol: een indelingsadvies starten is niet mogelijk. Je kunt het indelingsadvies wel bekijken vanuit een telling."
                : "Een beheerder moet je nog toegang geven voordat je het indelingsadvies kunt gebruiken."}
            </p>
          </div>
        </main>
      )}
    </div>
  );
}
