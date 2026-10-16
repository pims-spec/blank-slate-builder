import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { CodeInvoeren, KoppelCodeApp } from "@/components/TweeStaps";
import { Woordmerk } from "@/components/Woordmerk";
import { supabase } from "@/integrations/supabase/client";
import { tweestapsStap, veiligPad, type TweestapsStap } from "@/lib/tweestaps";

// Tweestapsverificatie na het inloggen: verplicht voor iedereen. Zonder gekoppelde code-app eerst
// koppelen; anders de code invoeren. Pas daarna is de rest van de app bereikbaar.
export const Route = createFileRoute("/tweestaps")({
  ssr: false,
  validateSearch: z.object({ redirect: z.string().optional() }),
  head: () => ({ meta: [{ title: "Tweestapsverificatie — GoHome WWS" }] }),
  beforeLoad: async ({ location }) => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/auth", search: { redirect: location.href } });
  },
  component: TweestapsPagina,
});

function TweestapsPagina() {
  const navigate = useNavigate();
  const { redirect: terug } = Route.useSearch();
  const [stap, setStap] = useState<TweestapsStap | null>(null);
  const [fout, setFout] = useState(false);

  const verder = () => void navigate({ to: veiligPad(terug), replace: true });

  useEffect(() => {
    void supabase.auth.mfa.getAuthenticatorAssuranceLevel().then(({ data, error }) => {
      if (error || !data) return setFout(true);
      const s = tweestapsStap(data);
      if (s === "ok") void navigate({ to: veiligPad(terug), replace: true });
      else setStap(s);
    });
  }, [navigate, terug]);

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-md space-y-6 rounded-2xl border border-border bg-card p-6">
        <Woordmerk />
        <div>
          <h1 className="text-xl font-semibold">
            {stap === "instellen" ? "Tweestapsverificatie instellen" : "Tweestapsverificatie"}
          </h1>
          {stap === "instellen" && (
            <p className="mt-1 text-sm text-muted-foreground">
              Voor GoHome advice is een tweede stap verplicht: naast je wachtwoord een code uit een
              app op je telefoon. Je stelt dit één keer in.
            </p>
          )}
        </div>
        {fout ? (
          <p role="alert" className="text-sm text-destructive">
            Controleren lukte niet. Ververs de pagina of log opnieuw in.
          </p>
        ) : stap === "instellen" ? (
          <KoppelCodeApp onKlaar={verder} />
        ) : stap === "code" ? (
          <CodeInvoeren onKlaar={verder} />
        ) : (
          <p className="text-sm text-muted-foreground">Controleren…</p>
        )}
        <Button
          variant="ghost"
          size="sm"
          onClick={() =>
            void supabase.auth.signOut().then(() => navigate({ to: "/auth", replace: true }))
          }
        >
          Uitloggen
        </Button>
      </div>
    </main>
  );
}
