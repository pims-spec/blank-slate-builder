import { createFileRoute, redirect } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { AppHeader } from "@/components/AppHeader";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { allUsersQuery, myAccessQuery } from "@/lib/access";
import { serverStatus } from "@/lib/wws/opzoeken/opzoeken.functions";
import { ROL_LABEL, rolWijzigingen, type AppRole, type Rol } from "@/lib/rollen";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({
    meta: [
      { title: "Gebruikers beheren — Werkplaats" },
      { name: "description", content: "Geef gebruikers toegang tot Werkplaats." },
      { property: "og:title", content: "Gebruikers beheren — Werkplaats" },
      { property: "og:description", content: "Geef gebruikers toegang tot Werkplaats." },
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
    onSuccess: () => toast.success("Rol bijgewerkt"),
    onError: (e: Error) => toast.error(e.message),
    onSettled: () => qc.invalidateQueries({ queryKey: ["all-users"] }),
  });

  return (
    <div className="min-h-screen bg-background">
      <AppHeader isAdmin />
      <main className="mx-auto max-w-5xl px-6 py-12">
        <h1 className="font-display text-4xl text-foreground">Gebruikers</h1>
        <p className="mt-2 text-muted-foreground">
          Nieuwe aanmeldingen hebben pas toegang nadat jij ze een rol geeft. Een lezer kan alles
          bekijken, maar niets aanmaken, wijzigen of verwijderen.
        </p>
        <ul className="mt-8 divide-y divide-border rounded-xl border border-border bg-card">
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
                    className="rounded-md border border-input bg-background px-2.5 py-1.5 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    value={u.rol ?? ""}
                    disabled={zetRol.isPending}
                    onChange={(e) =>
                      zetRol.mutate({
                        id: u.id,
                        huidig: u.roles,
                        doel: (e.target.value || null) as Rol,
                      })
                    }
                  >
                    {KEUZES.map(([v, l]) => (
                      <option key={v} value={v}>
                        {l}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </li>
          ))}
        </ul>
        <ServerStatus />
      </main>
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
        <ul className="mt-4 divide-y divide-border rounded-xl border border-border bg-card">
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
    </section>
  );
}
