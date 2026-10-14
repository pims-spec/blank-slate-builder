import { createFileRoute, redirect } from "@tanstack/react-router";
import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { allUsersQuery, myAccessQuery } from "@/lib/access";

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

function Admin() {
  const { user } = Route.useRouteContext();
  const { data: users } = useSuspenseQuery(allUsersQuery());
  const qc = useQueryClient();

  const toggle = useMutation({
    mutationFn: async ({ id, grant, role }: { id: string; grant: boolean; role: "member" | "admin" }) => {
      const { error } = grant
        ? await supabase.from("user_roles").insert({ user_id: id, role })
        : await supabase.from("user_roles").delete().eq("user_id", id).eq("role", role);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["all-users"] });
      toast.success("Bijgewerkt");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="min-h-screen bg-background">
      <AppHeader isAdmin />
      <main className="mx-auto max-w-5xl px-6 py-12">
        <h1 className="font-display text-4xl text-foreground">Gebruikers</h1>
        <p className="mt-2 text-muted-foreground">
          Nieuwe aanmeldingen hebben pas toegang nadat jij ze goedkeurt.
        </p>
        <ul className="mt-8 divide-y divide-border rounded-xl border border-border bg-card">
          {users.map((u) => (
            <li key={u.id} className="flex flex-wrap items-center justify-between gap-4 p-4">
              <div>
                <p className="font-medium text-foreground">{u.display_name}</p>
                <p className="text-sm text-muted-foreground">{u.email}</p>
              </div>
              <div className="flex items-center gap-2">
                {u.isAdmin && <Badge>Beheerder</Badge>}
                {u.isMember ? <Badge variant="secondary">Toegang</Badge> : <Badge variant="outline">Wacht</Badge>}
                {u.id !== user.id && (
                  <>
                    <Button
                      size="sm"
                      variant={u.isMember ? "outline" : "default"}
                      disabled={toggle.isPending}
                      onClick={() => toggle.mutate({ id: u.id, grant: !u.isMember, role: "member" })}
                    >
                      {u.isMember ? "Toegang intrekken" : "Toegang geven"}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={toggle.isPending}
                      onClick={() => toggle.mutate({ id: u.id, grant: !u.isAdmin, role: "admin" })}
                    >
                      {u.isAdmin ? "Geen beheerder" : "Maak beheerder"}
                    </Button>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      </main>
    </div>
  );
}
