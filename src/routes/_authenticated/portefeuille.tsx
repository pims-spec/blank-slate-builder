import { createFileRoute, redirect } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { AppHeader } from "@/components/AppHeader";
import { NormenProvider } from "@/components/wws/NormenContext";
import Portefeuille from "@/components/wws/Portefeuille";
import { normenQuery } from "@/components/wws/tellingStore";
import { myAccessQuery } from "@/lib/access";

export const Route = createFileRoute("/_authenticated/portefeuille")({
  head: () => ({
    meta: [
      { title: "Dashboard — Werkplaats" },
      { name: "description", content: "Overzicht van de portefeuille." },
    ],
  }),
  // alleen admins en de kijkrol (zoals magDashboardZien() in wws-site.html)
  beforeLoad: async ({ context }) => {
    const access = await context.queryClient.ensureQueryData(myAccessQuery(context.user.id));
    if (!access.zietAlles) throw redirect({ to: "/dashboard" });
  },
  loader: ({ context }) => context.queryClient.ensureQueryData(normenQuery()),
  component: PortefeuillePage,
});

function PortefeuillePage() {
  const { user } = Route.useRouteContext();
  const { data } = useSuspenseQuery(myAccessQuery(user.id));
  const { data: normen } = useSuspenseQuery(normenQuery());
  return (
    <div className="min-h-screen bg-background">
      <AppHeader
        isAdmin={data.isAdmin}
        heeftToegang={data.heeftToegang}
        zietAlles={data.zietAlles}
        magSchrijven={data.magSchrijven}
      />
      <NormenProvider normen={normen}>
        <Portefeuille rechten={data} />
      </NormenProvider>
    </div>
  );
}
