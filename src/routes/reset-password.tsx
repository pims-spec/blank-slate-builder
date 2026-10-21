import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { wachtwoordFout } from "@/lib/wachtwoord";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "Nieuw wachtwoord — GoHome WWS" },
      { name: "description", content: "Stel een nieuw wachtwoord in voor GoHome WWS." },
      { property: "og:title", content: "Nieuw wachtwoord — GoHome WWS" },
      { property: "og:description", content: "Stel een nieuw wachtwoord in voor GoHome WWS." },
    ],
  }),
  component: ResetPassword,
});

function ResetPassword() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  async function submit(e: FormEvent) {
    e.preventDefault();
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      toast.error(wachtwoordFout(error));
      return;
    }
    toast.success("Wachtwoord bijgewerkt");
    navigate({ to: "/dashboard" });
  }
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6">
      <form onSubmit={submit} className="w-full max-w-sm space-y-4">
        <h1 className="font-display text-[34px] leading-tight text-foreground max-[720px]:text-[28px]">
          Nieuw wachtwoord
        </h1>
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
        <Button type="submit" className="w-full">
          Opslaan
        </Button>
      </form>
    </div>
  );
}
