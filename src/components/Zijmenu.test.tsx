import { render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { Zijmenu } from "./Zijmenu";

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    children,
    to,
    title,
    className,
  }: {
    children: ReactNode;
    to: string;
    title?: string;
    className?: string;
  }) => (
    <a href={to} title={title} className={className}>
      {children}
    </a>
  ),
  useNavigate: () => vi.fn(),
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { auth: { signOut: vi.fn() } } }));

describe("Zijmenu", () => {
  it("woordmerk, onderdelen met icoon en naam (ook als titel voor de icoonbalk), uitloggen", () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <Zijmenu isAdmin heeftToegang zietAlles magSchrijven />
      </QueryClientProvider>,
    );
    const nav = screen.getByRole("navigation", { name: "Hoofdmenu" });
    expect(within(nav).getByRole("link", { name: /GoHome WWS/ })).toHaveAttribute(
      "href",
      "/dashboard",
    );
    for (const [naam, to] of [
      ["Overzicht", "/dashboard"],
      ["Puntentelling", "/wws"],
      ["Archief", "/archief"],
      ["Dashboard", "/portefeuille"],
      ["Indelingsadvies", "/indeling"],
      ["Eigenaren", "/eigenaren"],
      ["Normen", "/normen"],
      ["Gebruikers", "/admin"],
    ]) {
      const link = within(nav).getByRole("link", { name: naam });
      expect(link).toHaveAttribute("href", to);
      expect(link).toHaveAttribute("title", naam);
    }
    expect(within(nav).getByRole("button", { name: "Uitloggen" })).toBeInTheDocument();
  });
});
