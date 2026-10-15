import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Woordmerk } from "@/components/Woordmerk";
import { APP_NAAM } from "@/lib/merk";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: APP_NAAM },
      { name: "description", content: "GoHome WWS-puntentelling. Alleen op uitnodiging." },
      { property: "og:title", content: APP_NAAM },
      { property: "og:description", content: "GoHome WWS-puntentelling. Alleen op uitnodiging." },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-6">
        <Woordmerk className="text-base" />
        <Button asChild variant="outline" size="sm">
          <Link to="/auth">Inloggen</Link>
        </Button>
      </header>
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col justify-center px-6 pb-24">
        <p className="text-sm uppercase tracking-widest text-muted-foreground">
          Alleen op uitnodiging
        </p>
        <h1 className="mt-4 max-w-3xl font-display text-6xl leading-[1.05] text-foreground md:text-7xl">
          WWS-puntentelling
        </h1>
        <p className="tagline mt-3 text-xl">Punten, huur en advies per woning.</p>
        <div className="mt-10">
          <Button asChild size="lg">
            <Link to="/auth">Aan de slag</Link>
          </Button>
        </div>
      </main>
    </div>
  );
}
