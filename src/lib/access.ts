import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const myAccessQuery = (userId: string) =>
  queryOptions({
    queryKey: ["my-access", userId],
    queryFn: async () => {
      const [{ data: profile }, { data: roles }] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", userId).maybeSingle(),
        supabase.from("user_roles").select("role").eq("user_id", userId),
      ]);
      const list = (roles ?? []).map((r) => r.role);
      return {
        profile,
        isAdmin: list.includes("admin"),
        isMember: list.includes("member") || list.includes("admin"),
      };
    },
  });

export const allUsersQuery = () =>
  queryOptions({
    queryKey: ["all-users"],
    queryFn: async () => {
      const [{ data: profiles, error }, { data: roles }] = await Promise.all([
        supabase.from("profiles").select("*").order("created_at", { ascending: false }),
        supabase.from("user_roles").select("user_id, role"),
      ]);
      if (error) throw error;
      return (profiles ?? []).map((p) => {
        const r = (roles ?? []).filter((x) => x.user_id === p.id).map((x) => x.role);
        return { ...p, isAdmin: r.includes("admin"), isMember: r.includes("member") };
      });
    },
  });
