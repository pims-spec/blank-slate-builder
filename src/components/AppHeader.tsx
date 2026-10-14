import { Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

export function AppHeader({ isAdmin }: { isAdmin?: boolean }) {
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
      <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
        <Link to="/dashboard" className="font-display text-xl text-foreground">
          Werkplaats
        </Link>
        <nav className="flex items-center gap-2">
          <Button asChild variant="ghost" size="sm">
            <Link to="/dashboard">Overzicht</Link>
          </Button>
          <Button asChild variant="ghost" size="sm">
            <Link to="/wws">Puntentelling</Link>
          </Button>
          <Button asChild variant="ghost" size="sm">
            <Link to="/archief">Archief</Link>
          </Button>
          {isAdmin && (
            <Button asChild variant="ghost" size="sm">
              <Link to="/admin">Gebruikers</Link>
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={signOut}>
            Uitloggen
          </Button>
        </nav>
      </div>
    </header>
  );
}
