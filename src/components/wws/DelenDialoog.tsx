import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { deelbareCollegas } from "@/lib/wws/opslag";
import { delenStore } from "./tellingStore";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tellingId: string;
  /** Eigenaar van de telling (niet in de lijst) */
  ownerId: string;
  userId: string;
  isAdmin: boolean;
}

/**
 * Telling delen met collega's — openDelen() in wws-site.html. Alleen collega's met een rol;
 * zij kunnen de telling bekijken, maar niet aanpassen (ook de database staat dat niet toe).
 */
export default function DelenDialoog({
  open,
  onOpenChange,
  tellingId,
  ownerId,
  userId,
  isAdmin,
}: Props) {
  const qc = useQueryClient();
  const collegas = useQuery({
    queryKey: ["collegas", isAdmin],
    queryFn: () => delenStore.collegas(isAdmin),
    enabled: open,
  });
  const gedeeld = useQuery({
    queryKey: ["gedeeld", tellingId],
    queryFn: () => delenStore.gedeeldMet(tellingId),
    enabled: open,
  });

  const wissel = useMutation({
    mutationFn: ({ userId: u, aan }: { userId: string; aan: boolean }) =>
      aan ? delenStore.deel(tellingId, u) : delenStore.ontdeel(tellingId, u),
    onError: (e: Error) => toast.error("Delen lukte niet: " + e.message),
    onSettled: () => qc.invalidateQueries({ queryKey: ["gedeeld", tellingId] }),
  });

  const lijst = deelbareCollegas(collegas.data ?? [], userId, ownerId);
  const met = new Set(gedeeld.data ?? []);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Telling delen</DialogTitle>
          <DialogDescription>
            Vink aan met welke collega('s) je deze telling deelt. Zij kunnen de telling bekijken,
            maar niet aanpassen.
          </DialogDescription>
        </DialogHeader>
        {collegas.isPending || gedeeld.isPending ? (
          <p className="text-sm text-muted-foreground">Laden…</p>
        ) : collegas.error || gedeeld.error ? (
          <p className="text-sm text-destructive">
            Laden lukte niet: {(collegas.error ?? gedeeld.error)?.message}
          </p>
        ) : !lijst.length ? (
          <p className="text-sm text-muted-foreground">
            Er zijn nog geen andere collega's om mee te delen.
          </p>
        ) : (
          <ul className="max-h-80 space-y-1 overflow-y-auto">
            {lijst.map((c) => (
              <li key={c.id}>
                <label className="flex items-center gap-3 rounded-md px-2 py-1.5 text-sm hover:bg-muted">
                  <input
                    type="checkbox"
                    className="size-4 accent-primary"
                    checked={met.has(c.id)}
                    disabled={wissel.isPending}
                    onChange={(e) => wissel.mutate({ userId: c.id, aan: e.target.checked })}
                  />
                  <span>
                    {c.naam}
                    {c.email && c.email !== c.naam && (
                      <span className="block text-xs text-muted-foreground">{c.email}</span>
                    )}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}
