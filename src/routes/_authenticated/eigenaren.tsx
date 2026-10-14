import { createFileRoute, redirect } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { AppHeader } from "@/components/AppHeader";
import Eigenaren from "@/components/wws/Eigenaren";
import { myAccessQuery } from "@/lib/access";

export const Route = createFileRoute("/_authenticated/eigenaren")({
  head: () => ({
    meta: [
      { title: "Eigenaren — Werkplaats" },
      { name: "description", content: "Eigenaren en opdrachtgevers van de tellingen." },
    ],
  }),
  beforeLoad: async ({ context }) => {
    const access = await context.queryClient.ensureQueryData(myAccessQuery(context.user.id));
    if (!access.heeftToegang) throw redirect({ to: "/dashboard" });
  },
  component: EigenarenPage,
});

function EigenarenPage() {
  const { user } = Route.useRouteContext();
  const { data } = useSuspenseQuery(myAccessQuery(user.id));
  return (
    <div className="min-h-screen bg-background">
      <AppHeader isAdmin={data.isAdmin} heeftToegang={data.heeftToegang} />
      <Eigenaren rechten={data} />
    </div>
  );
}
