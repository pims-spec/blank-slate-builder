import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Woordmerk } from "@/components/Woordmerk";

export const Route = createFileRoute("/uitnodiging")({
  head: () => ({ meta: [
    { title: "Uitnodiging accepteren — GoHome advice" },
    { name: "description", content: "Activeer je account voor GoHome advice." },
    { property: "og:title", content: "Uitnodiging accepteren — GoHome advice" },
    { property: "og:description", content: "Activeer je account voor GoHome advice." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: Uitnodiging,
});

function Uitnodiging() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<"loading" | "ready" | "invalid">("loading");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    void supabase.auth.getUser().then(({ data }) => {
      if (active) setStatus(data.user ? "ready" : "invalid");
    });
    return () => { active = false; };
  }, []);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (password !== confirmation) { setError("De wachtwoorden komen niet overeen."); return; }
    setBusy(true);
    setError("");
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) { setError("Het wachtwoord kon niet worden ingesteld. Probeer opnieuw."); return; }
      await navigate({ to: "/dashboard", replace: true });
    } catch { setError("Activeren is niet gelukt. Probeer opnieuw."); }
    finally { setBusy(false); }
  }
  return <main className="flex min-h-screen items-center justify-center bg-background px-6">
    <div className="w-full max-w-sm space-y-6">
      <Woordmerk className="text-lg" />
      <h1 className="font-display text-3xl text-foreground">Uitnodiging accepteren</h1>
      {status === "loading" ? <p className="text-muted-foreground">Uitnodiging controleren…</p> : status === "invalid" ? <>
        <p role="alert" className="text-muted-foreground">Deze uitnodiging is ongeldig of verlopen. Vraag je beheerder om hulp.</p>
        <Button asChild variant="outline"><Link to="/auth">Naar inloggen</Link></Button>
      </> : <form onSubmit={submit} className="space-y-4">
        <div className="space-y-2"><Label htmlFor="invite-password">Wachtwoord</Label><Input id="invite-password" type="password" autoComplete="new-password" minLength={6} required disabled={busy} value={password} onChange={(event) => setPassword(event.target.value)} /></div>
        <div className="space-y-2"><Label htmlFor="invite-confirmation">Herhaal wachtwoord</Label><Input id="invite-confirmation" type="password" autoComplete="new-password" minLength={6} required disabled={busy} value={confirmation} onChange={(event) => setConfirmation(event.target.value)} /></div>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <Button className="w-full" disabled={busy}>{busy ? "Activeren…" : "Account activeren"}</Button>
      </form>}
    </div>
  </main>;
}