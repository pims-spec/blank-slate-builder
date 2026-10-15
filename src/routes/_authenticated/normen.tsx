import { createFileRoute, redirect } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Zijmenu, zijmenuRuimte } from "@/components/Zijmenu";
import NormenBeheer from "@/components/wws/NormenBeheer";
import { normenQuery } from "@/components/wws/tellingStore";
import { myAccessQuery } from "@/lib/access";

export const Route = createFileRoute("/_authenticated/normen")({
  head: () => ({
    meta: [
      { title: "Normen — GoHome WWS" },
      { name: "description", content: "Normen en parameters van de WWS-puntentelling." },
    ],
  }),
  beforeLoad: async ({ context }) => {
    const access = await context.queryClient.ensureQueryData(myAccessQuery(context.user.id));
    if (!access.isAdmin) throw redirect({ to: "/dashboard" });
  },
  loader: ({ context }) => context.queryClient.ensureQueryData(normenQuery()),
  component: NormenPage,
});

function NormenPage() {
  const { data: normen, dataUpdatedAt } = useSuspenseQuery(normenQuery());
  return (
    <div className={"min-h-screen " + zijmenuRuimte}>
      <Zijmenu isAdmin magSchrijven />
      {/* key: na opslaan het formulier opnieuw vullen met de opgeslagen normen */}
      <NormenBeheer key={dataUpdatedAt} normen={normen} />
    </div>
  );
}
