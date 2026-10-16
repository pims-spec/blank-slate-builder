import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { tweestapsStap } from "@/lib/tweestaps";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) {
      throw redirect({ to: "/auth", search: { redirect: location.href } });
    }
    // tweestapsverificatie is verplicht: zonder code (aal2) eerst naar /tweestaps
    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (tweestapsStap(aal ?? { currentLevel: null, nextLevel: null }) !== "ok") {
      throw redirect({ to: "/tweestaps", search: { redirect: location.href } });
    }
    return { user: data.user };
  },
  component: () => <Outlet />,
});
