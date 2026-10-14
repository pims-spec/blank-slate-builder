import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Werkplaats — Alleen op uitnodiging" },
      { name: "description", content: "Een besloten werkplek. Log in of vraag toegang aan." },
      { property: "og:title", content: "Werkplaats — Alleen op uitnodiging" },
      { property: "og:description", content: "Een besloten werkplek. Log in of vraag toegang aan." },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-6">
        <span className="font-display text-xl text-foreground">Werkplaats</span>
        <Button asChild variant="outline" size="sm">
          <Link to="/auth">Inloggen</Link>
        </Button>
      </header>
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col justify-center px-6 pb-24">
        <p className="text-sm uppercase tracking-widest text-muted-foreground">Alleen op uitnodiging</p>
        <h1 className="mt-4 max-w-3xl font-display text-6xl leading-[1.05] text-foreground md:text-7xl">
          Een besloten plek voor de mensen die jij toelaat.
        </h1>
        <div className="mt-10">
          <Button asChild size="lg">
            <Link to="/auth">Aan de slag</Link>
          </Button>
        </div>
      </main>
    </div>
  );
}
