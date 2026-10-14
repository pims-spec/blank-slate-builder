import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { rechtenVan, type AppRole } from "@/lib/rollen";

export const myAccessQuery = (userId: string) =>
  queryOptions({
    queryKey: ["my-access", userId],
    queryFn: async () => {
      const [{ data: profile }, { data: roles }] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", userId).maybeSingle(),
        supabase.from("user_roles").select("role").eq("user_id", userId),
      ]);
      const list = (roles ?? []).map((r) => r.role);
      return { profile, roles: list, ...rechtenVan(list) };
    },
  });

/** Alle gebruikers met hun rollen (alleen voor admins: zij mogen alle profielen en rollen lezen) */
export const allUsersQuery = () =>
  queryOptions({
    queryKey: ["all-users"],
    queryFn: async () => {
      const [{ data: profiles, error }, { data: roles, error: e2 }] = await Promise.all([
        supabase.from("profiles").select("*").order("created_at", { ascending: false }),
        supabase.from("user_roles").select("user_id, role"),
      ]);
      if (error) throw error;
      if (e2) throw e2;
      return (profiles ?? []).map((p) => {
        const r: AppRole[] = (roles ?? []).filter((x) => x.user_id === p.id).map((x) => x.role);
        return { ...p, roles: r, ...rechtenVan(r) };
      });
    },
  });
