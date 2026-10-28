import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Zijmenu, zijmenuRuimte } from "@/components/Zijmenu";
import { BloxsBeheer } from "@/components/wws/BloxsBeheer";
import { CollegaUitnodigen } from "@/components/CollegaUitnodigen";
import { GebruikerVerwijderen } from "@/components/GebruikerVerwijderen";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { allUsersQuery, myAccessQuery } from "@/lib/access";
import { resetTweestaps } from "@/lib/tweestaps.functions";
import { serverStatus } from "@/lib/wws/opzoeken/opzoeken.functions";
import { ROL_LABEL, rolWijzigingen, type AppRole, type Rol } from "@/lib/rollen";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({
    meta: [
      { title: "Gebruikers beheren — GoHome WWS" },
      { name: "description", content: "Geef gebruikers toegang tot GoHome WWS." },
      { property: "og:title", content: "Gebruikers beheren — GoHome WWS" },
      { property: "og:description", content: "Geef gebruikers toegang tot GoHome WWS." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  beforeLoad: async ({ context }) => {
    const access = await context.queryClient.ensureQueryData(myAccessQuery(context.user.id));
    if (!access.isAdmin) throw redirect({ to: "/dashboard" });
  },
  loader: ({ context }) => context.queryClient.ensureQueryData(allUsersQuery()),
  component: Admin,
});

const KEUZES: [Exclude<Rol, null> | "", string][] = [
  ["", "Wacht op toegang"],
  ["member", "Collega"],
  ["viewer", "Lezer (alleen bekijken)"],
  ["admin", "Beheerder"],
];

function Admin() {
  const { user } = Route.useRouteContext();
  const { data: users } = useSuspenseQuery(allUsersQuery());
  const qc = useQueryClient();
  const [intrekken, setIntrekken] = useState<(typeof users)[number] | null>(null);
  const [reset, setReset] = useState<(typeof users)[number] | null>(null);
  const [verwijderen, setVerwijderen] = useState<(typeof users)[number] | null>(null);
  const resetMutatie = useMutation({
    mutationFn: async (id: string) => {
      const r = await resetTweestaps({ data: { userId: id } });
      if (!r.ok)
        throw new Error(
          r.fout === "eigen_account"
            ? "Je eigen tweestapsverificatie kun je niet resetten."
            : "Resetten lukte niet. Probeer het later opnieuw.",
        );
      return r.verwijderd;
    },
    onSuccess: (n) => {
      setReset(null);
      toast.success(
        n
          ? "Tweestapsverificatie gereset. Bij de volgende keer inloggen koppelt de collega opnieuw een code-app."
          : "Deze collega had nog geen code-app gekoppeld.",
      );
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const zetRol = useMutation({
    mutationFn: async ({ id, huidig, doel }: { id: string; huidig: AppRole[]; doel: Rol }) => {
      // eigen rol nooit wijzigen: geen kijkrol voor jezelf, en je admin-rol blijft
      if (id === user.id) throw new Error("Je kunt je eigen rol niet wijzigen.");
      const { verwijder, voegToe } = rolWijzigingen(huidig, doel);
      // eerst weghalen: de database weigert de kijkrol naast een andere rol
      if (verwijder.length) {
        const { error } = await supabase
          .from("user_roles")
          .delete()
          .eq("user_id", id)
          .in("role", verwijder);
        if (error) throw error;
      }
      if (voegToe.length) {
        const { error } = await supabase
          .from("user_roles")
          .insert(voegToe.map((role) => ({ user_id: id, role })));
        if (error) throw error;
      }
    },
    onSuccess: (_, { doel }) => {
      setIntrekken(null);
      toast.success(doel === null ? "Toegang ingetrokken" : "Rol bijgewerkt");
    },
    onError: (e: Error) => toast.error(e.message),
    onSettled: () => qc.invalidateQueries({ queryKey: ["all-users"] }),
  });

  return (
    <div className={"min-h-screen " + zijmenuRuimte}>
      <Zijmenu isAdmin magSchrijven />
      <main className="mx-auto max-w-5xl px-6 py-12">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h1 className="font-display text-[34px] leading-tight text-foreground max-[720px]:text-[28px]">
            Gebruikers
          </h1>
          <CollegaUitnodigen />
        </div>
        <p className="mt-2 text-muted-foreground">
          Nieuwe aanmeldingen hebben pas toegang nadat jij ze een rol geeft. Een lezer kan alles
          bekijken, maar niets aanmaken, wijzigen of verwijderen. Verwijder je een gebruiker, dan
          gaan diens tellingen naar een collega die jij kiest.
        </p>
        <ul className="mt-8 divide-y divide-border gh-card">
          {users.map((u) => (
            <li key={u.id} className="flex flex-wrap items-center justify-between gap-4 p-4">
              <div>
                <p className="font-medium text-foreground">{u.display_name}</p>
                <p className="text-sm text-muted-foreground">{u.email}</p>
              </div>
              {u.id === user.id ? (
                <div className="flex items-center gap-2">
                  <Badge>{u.rol ? ROL_LABEL[u.rol] : "Wacht"}</Badge>
                  <span className="text-xs text-muted-foreground">
                    Je eigen rol kun je niet wijzigen
                  </span>
                </div>
              ) : (
                <label className="flex items-center gap-2 text-sm">
                  <span className="sr-only">Rol van {u.display_name || u.email}</span>
                  <select
                    className="rounded-lg border border-transparent bg-muted px-2.5 py-1.5 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    value={u.rol ?? ""}
                    disabled={zetRol.isPending}
                    onChange={(e) => {
                      if (e.target.value === "intrekken") {
                        setIntrekken(u);
                        return;
                      }
                      zetRol.mutate({
                        id: u.id,
                        huidig: u.roles,
                        doel: (e.target.value || null) as Rol,
                      });
                    }}
                  >
                    {KEUZES.map(([v, l]) => (
                      <option key={v} value={v}>
                        {l}
                      </option>
                    ))}
                    {u.heeftToegang && <option value="intrekken">Toegang intrekken…</option>}
                  </select>
                </label>
              )}
              {u.id !== user.id && (
                <div className="flex items-center gap-1">
                  <Button size="sm" variant="ghost" onClick={() => setReset(u)}>
                    2FA resetten
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setVerwijderen(u)}>
                    Verwijderen…
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
        <ServerStatus />
      </main>
      {verwijderen && (
        <GebruikerVerwijderen
          key={verwijderen.id}
          gebruiker={verwijderen}
          gebruikers={users}
          onSluit={() => setVerwijderen(null)}
        />
      )}
      <AlertDialog
        open={reset !== null}
        onOpenChange={(open) => {
          if (!open && !resetMutatie.isPending) setReset(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Tweestapsverificatie resetten?</AlertDialogTitle>
            <AlertDialogDescription>
              Alle gekoppelde code-apps van {reset?.display_name || reset?.email} worden verwijderd.
              Doe dit alleen als je zeker weet dat deze collega erom vraagt (bijv. telefoon kwijt).
              Bij de volgende keer inloggen koppelt de collega opnieuw een code-app.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={resetMutatie.isPending}>Annuleren</AlertDialogCancel>
            <Button
              variant="destructive"
              disabled={resetMutatie.isPending}
              onClick={() => reset && resetMutatie.mutate(reset.id)}
            >
              {resetMutatie.isPending ? "Resetten…" : "2FA resetten"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog
        open={intrekken !== null}
        onOpenChange={(open) => {
          if (!open && !zetRol.isPending) setIntrekken(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Toegang intrekken?</AlertDialogTitle>
            <AlertDialogDescription>
              De toegang van {intrekken?.display_name || intrekken?.email} wordt ingetrokken. Het
              account en bestaande tellingen blijven bewaard. Je kunt later opnieuw een rol
              toekennen.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={zetRol.isPending}>Annuleren</AlertDialogCancel>
            <Button
              variant="destructive"
              disabled={zetRol.isPending}
              onClick={() => {
                if (!intrekken) return;
                zetRol.mutate({ id: intrekken.id, huidig: intrekken.roles, doel: null });
              }}
            >
              {zetRol.isPending ? "Intrekken…" : "Toegang intrekken"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/** Welke secrets zijn ingesteld (alleen aanwezig of niet, nooit de waarde) */
function ServerStatus() {
  const { data, isPending, isError } = useQuery({
    queryKey: ["server-status"],
    queryFn: () => serverStatus(),
    staleTime: 0,
  });
  return (
    <section className="mt-12" aria-label="Serverinstellingen">
      <h2 className="font-display text-2xl text-foreground">Serverinstellingen</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Sleutels voor externe diensten stel je in bij Lovable Cloud → Secrets. Hier zie je alleen of
        ze aanwezig zijn, nooit de waarde.
      </p>
      {isPending ? (
        <p className="mt-4 text-sm text-muted-foreground">Controleren…</p>
      ) : isError || !data ? (
        <p className="mt-4 text-sm text-destructive">Controleren lukte niet.</p>
      ) : (
        <ul className="mt-4 divide-y divide-border gh-card">
          {Object.entries(data.sleutels).map(([naam, aanwezig]) => (
            <li key={naam} className="flex items-center justify-between gap-4 p-4">
              <code className="text-sm">{naam}</code>
              <Badge variant={aanwezig ? "default" : "destructive"}>
                {aanwezig ? "Ingesteld" : "Ontbreekt"}
              </Badge>
            </li>
          ))}
          {Object.entries(data.modellen).map(([naam, model]) => (
            <li key={naam} className="flex items-center justify-between gap-4 p-4">
              <code className="text-sm">{naam}</code>
              <span className="text-sm text-muted-foreground">{model}</span>
            </li>
          ))}
        </ul>
      )}
      <BloxsBeheer />
    </section>
  );
}
