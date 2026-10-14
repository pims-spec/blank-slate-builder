import { Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

export function AppHeader({
  isAdmin,
  heeftToegang = true,
}: {
  isAdmin?: boolean;
  /** Zonder rol: alleen Overzicht en Uitloggen */
  heeftToegang?: boolean;
}) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }
  return (
    <header className="border-b border-border">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-2 px-6 py-4">
        <Link to="/dashboard" className="font-display text-xl text-foreground">
          Werkplaats
        </Link>
        <nav className="flex flex-wrap items-center gap-1">
          <Button asChild variant="ghost" size="sm">
            <Link to="/dashboard">Overzicht</Link>
          </Button>
          {heeftToegang && (
            <>
              <Button asChild variant="ghost" size="sm">
                <Link to="/wws">Puntentelling</Link>
              </Button>
              <Button asChild variant="ghost" size="sm">
                <Link to="/archief">Archief</Link>
              </Button>
              <Button asChild variant="ghost" size="sm">
                <Link to="/eigenaren">Eigenaren</Link>
              </Button>
            </>
          )}
          {isAdmin && (
            <>
              <Button asChild variant="ghost" size="sm">
                <Link to="/normen">Normen</Link>
              </Button>
              <Button asChild variant="ghost" size="sm">
                <Link to="/admin">Gebruikers</Link>
              </Button>
            </>
          )}
          <Button variant="outline" size="sm" onClick={signOut}>
            Uitloggen
          </Button>
        </nav>
      </div>
    </header>
  );
}
