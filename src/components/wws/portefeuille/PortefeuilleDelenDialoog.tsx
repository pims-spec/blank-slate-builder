import { useState } from "react";
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
import { delenStore } from "../tellingStore";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Eén portefeuille, of de portefeuilles van een gecombineerde analyse (die je mag delen) */
  portefeuilles: readonly { id: string; naam: string; createdBy: string | null }[];
  userId: string;
  isAdmin: boolean;
}

/**
 * Portefeuille delen met collega's. Zij kunnen de portefeuille en de analyses ervan bekijken én
 * bijwerken (labels ophalen, opnieuw inladen uit Bloxs, analyses opslaan); verwijderen blijft
 * voor de maker of een beheerder. De database (portefeuille_shares + RLS) bepaalt wie mag delen.
 */
export function PortefeuilleDelenDialoog({
  open,
  onOpenChange,
  portefeuilles,
  userId,
  isAdmin,
}: Props) {
  const qc = useQueryClient();
  const [gekozen, setGekozen] = useState<string | null>(null);
  const p = portefeuilles.find((x) => x.id === gekozen) ?? portefeuilles[0] ?? null;

  const collegas = useQuery({
    queryKey: ["collegas", isAdmin],
    queryFn: () => delenStore.collegas(isAdmin),
    enabled: open,
  });
  const gedeeld = useQuery({
    queryKey: ["portefeuille-gedeeld", p?.id ?? ""],
    queryFn: () => delenStore.portefeuilleGedeeldMet(p!.id),
    enabled: open && !!p,
  });

  const wissel = useMutation({
    mutationFn: ({ u, aan }: { u: string; aan: boolean }) =>
      aan ? delenStore.deelPortefeuille(p!.id, u) : delenStore.ontdeelPortefeuille(p!.id, u),
    onError: (e: Error) => toast.error("Delen lukte niet: " + e.message),
    onSettled: () => qc.invalidateQueries({ queryKey: ["portefeuille-gedeeld", p?.id ?? ""] }),
  });

  const lijst = p ? deelbareCollegas(collegas.data ?? [], userId, p.createdBy ?? "") : [];
  const met = new Set(gedeeld.data ?? []);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Portefeuille delen</DialogTitle>
          <DialogDescription>
            Collega's met wie je deelt kunnen de portefeuille en de analyses ervan bekijken en
            bijwerken (labels ophalen, opnieuw inladen uit Bloxs, analyses opslaan). Verwijderen kan
            alleen de maker of een beheerder.
          </DialogDescription>
        </DialogHeader>
        {!p ? (
          <p className="text-sm text-muted-foreground">
            Alleen de maker van een portefeuille of een beheerder kan hem delen.
          </p>
        ) : (
          <>
            {portefeuilles.length > 1 && (
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-muted-foreground">Portefeuille</span>
                <select
                  className="h-9 max-w-full rounded-xl border border-input bg-background px-2"
                  value={p.id}
                  onChange={(e) => setGekozen(e.target.value)}
                >
                  {portefeuilles.map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.naam}
                    </option>
                  ))}
                </select>
              </label>
            )}
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
              <ul className="max-h-80 space-y-1 overflow-y-auto" aria-label="Collega's">
                {lijst.map((c) => (
                  <li key={c.id}>
                    <label className="flex items-center gap-3 rounded-md px-2 py-1.5 text-sm hover:bg-muted">
                      <input
                        type="checkbox"
                        className="size-4 accent-primary"
                        checked={met.has(c.id)}
                        disabled={wissel.isPending}
                        onChange={(e) => wissel.mutate({ u: c.id, aan: e.target.checked })}
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
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
