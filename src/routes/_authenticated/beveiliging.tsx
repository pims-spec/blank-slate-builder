import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Zijmenu, zijmenuRuimte } from "@/components/Zijmenu";
import { KoppelCodeApp } from "@/components/TweeStaps";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { myAccessQuery } from "@/lib/access";

export const Route = createFileRoute("/_authenticated/beveiliging")({
  head: () => ({ meta: [{ title: "Beveiliging — GoHome WWS" }] }),
  loader: ({ context }) => context.queryClient.ensureQueryData(myAccessQuery(context.user.id)),
  component: BeveiligingPagina,
});

interface Factor {
  id: string;
  naam: string;
  sinds: string;
}

/** Tweestapsverificatie: gekoppelde code-apps bekijken, een tweede toevoegen of er een verwijderen */
function BeveiligingPagina() {
  const { user } = Route.useRouteContext();
  const { data } = useSuspenseQuery(myAccessQuery(user.id));
  const [factoren, setFactoren] = useState<Factor[] | null>(null);
  const [koppelen, setKoppelen] = useState(false);

  async function laad() {
    const { data: f } = await supabase.auth.mfa.listFactors();
    setFactoren(
      (f?.totp ?? []).map((x) => ({
        id: x.id,
        naam: x.friendly_name || "Code-app",
        sinds: new Date(x.created_at).toLocaleDateString("nl-NL", { dateStyle: "medium" }),
      })),
    );
  }
  useEffect(() => {
    void laad();
  }, []);

  async function verwijder(f: Factor) {
    const { error } = await supabase.auth.mfa.unenroll({ factorId: f.id });
    if (error) toast.error("Verwijderen lukte niet.");
    else toast.success("Code-app verwijderd.");
    await laad();
  }

  return (
    <div className={"min-h-screen " + zijmenuRuimte}>
      <Zijmenu
        isAdmin={data.isAdmin}
        heeftToegang={data.heeftToegang}
        zietAlles={data.zietAlles}
        magSchrijven={data.magSchrijven}
      />
      <main className="mx-auto max-w-2xl px-4 py-8">
        <h1 className="text-2xl font-semibold tracking-tight">Beveiliging</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Tweestapsverificatie is verplicht: na je wachtwoord vraagt GoHome advice een code uit een
          app op je telefoon. Koppel gerust een tweede apparaat, zodat je er niet afhankelijk bent
          van één telefoon.
        </p>

        <section
          className="mt-6 rounded-2xl border border-border bg-card p-4"
          aria-label="Code-apps"
        >
          <h2 className="mb-2 font-semibold">Gekoppelde code-apps</h2>
          {!factoren ? (
            <p className="text-sm text-muted-foreground">Laden…</p>
          ) : (
            <ul className="divide-y divide-border">
              {factoren.map((f) => (
                <li key={f.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span className="text-sm">
                    {f.naam}
                    <span className="block text-xs text-muted-foreground">gekoppeld {f.sinds}</span>
                  </span>
                  {factoren.length > 1 && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive hover:text-destructive"
                      onClick={() => void verwijder(f)}
                    >
                      Verwijderen
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
          {factoren && factoren.length === 1 && (
            <p className="mt-2 text-xs text-muted-foreground">
              De laatste code-app kun je niet verwijderen. Telefoon kwijt? Vraag een beheerder om je
              tweestapsverificatie te resetten.
            </p>
          )}
        </section>

        <section className="mt-4 rounded-2xl border border-border bg-card p-4">
          {koppelen ? (
            <KoppelCodeApp
              onKlaar={() => {
                setKoppelen(false);
                toast.success("Code-app gekoppeld.");
                void laad();
              }}
            />
          ) : (
            <Button variant="outline" onClick={() => setKoppelen(true)}>
              Nog een code-app koppelen
            </Button>
          )}
        </section>
      </main>
    </div>
  );
}
