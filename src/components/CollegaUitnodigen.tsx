import { useState, type FormEvent } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { UserPlus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { nodigCollegaUit } from "@/lib/uitnodigen.functions";

export function CollegaUitnodigen() {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [rol, setRol] = useState<"member" | "viewer" | "admin">("member");
  const invite = useServerFn(nodigCollegaUit);
  const qc = useQueryClient();
  const mutation = useMutation({
    mutationFn: () => invite({ data: { email, rol } }),
    onSuccess: () => {
      toast.success("Uitnodiging verstuurd naar " + email);
      setOpen(false);
      setEmail("");
      setRol("member");
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["all-users"] }),
  });
  function submit(event: FormEvent) {
    event.preventDefault();
    mutation.mutate();
  }
  return (
    <>
      <Button
        onClick={() => {
          mutation.reset();
          setOpen(true);
        }}
      >
        <UserPlus />
        Collega uitnodigen
      </Button>
      <Dialog
        open={open}
        onOpenChange={(value) => {
          if (!mutation.isPending) setOpen(value);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Collega uitnodigen</DialogTitle>
            <DialogDescription>
              Je collega ontvangt een e-mail om het account te activeren.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="invite-email">E-mailadres</Label>
              <Input
                id="invite-email"
                type="email"
                autoComplete="email"
                required
                maxLength={254}
                value={email}
                disabled={mutation.isPending}
                onChange={(event) => setEmail(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="invite-role">Rol</Label>
              <select
                id="invite-role"
                className="w-full rounded-lg border border-transparent bg-muted px-3 py-2 text-sm text-foreground"
                value={rol}
                disabled={mutation.isPending}
                onChange={(event) => setRol(event.target.value as typeof rol)}
              >
                <option value="member">Collega</option>
                <option value="viewer">Lezer (alleen bekijken)</option>
                <option value="admin">Beheerder</option>
              </select>
            </div>
            {mutation.isError && (
              <p role="alert" className="text-sm text-destructive">
                {mutation.error.message}
              </p>
            )}
            <div className="flex flex-wrap justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                disabled={mutation.isPending}
                onClick={() => setOpen(false)}
              >
                Annuleren
              </Button>
              <Button type="submit" disabled={mutation.isPending}>
                {mutation.isPending ? "Versturen…" : "Uitnodiging versturen"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
