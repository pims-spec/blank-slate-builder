import { createFileRoute, redirect } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { AppHeader } from "@/components/AppHeader";
import Eigenaren from "@/components/wws/Eigenaren";
import { NormenProvider } from "@/components/wws/NormenContext";
import { normenQuery } from "@/components/wws/tellingStore";
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
  loader: ({ context }) => context.queryClient.ensureQueryData(normenQuery()),
  component: EigenarenPage,
});

function EigenarenPage() {
  const { user } = Route.useRouteContext();
  const { data } = useSuspenseQuery(myAccessQuery(user.id));
  const { data: normen } = useSuspenseQuery(normenQuery());
  return (
    <div className="min-h-screen bg-background">
      <AppHeader isAdmin={data.isAdmin} heeftToegang={data.heeftToegang} />
      <NormenProvider normen={normen}>
        <Eigenaren rechten={data} />
      </NormenProvider>
    </div>
  );
}
