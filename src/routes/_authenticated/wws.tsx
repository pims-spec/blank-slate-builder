import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { z } from "zod";
import { Zijmenu, zijmenuRuimte } from "@/components/Zijmenu";
import { NormenProvider } from "@/components/wws/NormenContext";
import TellingEditor from "@/components/wws/TellingEditor";
import { normenQuery } from "@/components/wws/tellingStore";
import { myAccessQuery } from "@/lib/access";

const search = z.object({
  id: z.string().optional(),
  /** Vanaf het startscherm van het indelingsadvies (zie /indeling) */
  indeling: z.boolean().optional(),
  blanco: z.boolean().optional(),
  /** Vanuit het archief: deze versie openen (nummer) */
  versie: z.number().int().positive().optional(),
});

export const Route = createFileRoute("/_authenticated/wws")({
  validateSearch: search,
  head: () => ({
    meta: [
      { title: "Puntentelling — GoHome WWS" },
      { name: "description", content: "WWS-puntentelling voor zelfstandige woonruimte." },
    ],
  }),
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(myAccessQuery(context.user.id)),
      context.queryClient.ensureQueryData(normenQuery()),
    ]),
  component: WwsPage,
});

function WwsPage() {
  const { user } = Route.useRouteContext();
  const { id, indeling, blanco, versie } = Route.useSearch();
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
          <TellingEditor
            tellingId={id}
            userId={user.id}
            bewerker={{ id: user.id, naam: data.profile?.display_name || email, email }}
            rechten={data}
            start={blanco ? "blanco" : indeling ? "indeling" : undefined}
            openVersie={versie}
          />
        </NormenProvider>
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
