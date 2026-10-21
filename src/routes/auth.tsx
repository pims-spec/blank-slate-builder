import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { Woordmerk } from "@/components/Woordmerk";

const search = z.object({ redirect: z.string().optional() });

export const Route = createFileRoute("/auth")({
  validateSearch: search,
  head: () => ({
    meta: [
      { title: "Inloggen — GoHome WWS" },
      { name: "description", content: "Log in of maak een account aan voor GoHome WWS." },
      { property: "og:title", content: "Inloggen — GoHome WWS" },
      { property: "og:description", content: "Log in of maak een account aan voor GoHome WWS." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"in" | "up" | "forgot">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/dashboard", replace: true });
    });
    const { data } = supabase.auth.onAuthStateChange((e, s) => {
      if (e === "SIGNED_IN" && s) navigate({ to: "/dashboard", replace: true });
    });
    return () => data.subscription.unsubscribe();
  }, [navigate]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "in") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else if (mode === "up") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin + "/dashboard" },
        });
        if (error) throw error;
        toast.success("Check je e-mail om je account te bevestigen.");
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: window.location.origin + "/reset-password",
        });
        if (error) throw error;
        toast.success("We hebben je een link gestuurd.");
      }
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function google() {
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin + "/auth",
    });
    if (result.error) toast.error(String(result.error.message ?? result.error));
  }

  const title =
    mode === "in" ? "Inloggen" : mode === "up" ? "Account aanmaken" : "Wachtwoord vergeten";

  return (
    <div className="flex min-h-screen items-center justify-center px-6">
      {/* .authcard in wws-site.html: één kaart met de inlogvelden */}
      <div className="w-full max-w-sm rounded-3xl border border-border bg-card p-8 shadow-[0_8px_24px_color-mix(in_oklab,var(--color-primary)_8%,transparent)]">
        <Woordmerk className="text-lg" />
        <h1 className="mt-8 font-display text-[34px] leading-tight text-foreground max-[720px]:text-[28px]">
          {title}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">GoHome WWS-puntentelling</p>
        {mode !== "forgot" && (
          <>
            <Button variant="outline" className="mt-8 w-full" onClick={google}>
              Doorgaan met Google
            </Button>
            <div className="my-6 flex items-center gap-3 text-xs text-muted-foreground">
              <span className="h-px flex-1 bg-border" /> of{" "}
              <span className="h-px flex-1 bg-border" />
            </div>
          </>
        )}
        <form onSubmit={submit} className={mode === "forgot" ? "mt-8 space-y-4" : "space-y-4"}>
          <div className="space-y-2">
            <Label htmlFor="email">E-mail</Label>
            <Input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          {mode !== "forgot" && (
            <div className="space-y-2">
              <Label htmlFor="pw">Wachtwoord</Label>
              <Input
                id="pw"
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          )}
          <Button type="submit" className="w-full" disabled={busy}>
            {mode === "in" ? "Inloggen" : mode === "up" ? "Registreren" : "Stuur link"}
          </Button>
        </form>
        <div className="mt-6 flex flex-col gap-2 text-sm text-muted-foreground">
          {mode === "in" && (
            <>
              <button className="text-left hover:text-foreground" onClick={() => setMode("forgot")}>
                Wachtwoord vergeten?
              </button>
              <button className="text-left hover:text-foreground" onClick={() => setMode("up")}>
                Nog geen account? Registreer
              </button>
            </>
          )}
          {mode !== "in" && (
            <button className="text-left hover:text-foreground" onClick={() => setMode("in")}>
              Terug naar inloggen
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
