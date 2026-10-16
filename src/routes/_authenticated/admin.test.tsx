import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ remove: vi.fn(), users: vi.fn() }));
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: object) => ({
    ...options, useRouteContext: () => ({ user: { id: "self" } }),
  }),
  redirect: vi.fn(),
}));
vi.mock("@/components/Zijmenu", () => ({ Zijmenu: () => null, zijmenuRuimte: "" }));
vi.mock("@/components/wws/BloxsBeheer", () => ({ BloxsBeheer: () => null }));
vi.mock("@/lib/wws/opzoeken/opzoeken.functions", () => ({
  serverStatus: async () => ({ sleutels: {}, modellen: {} }),
}));
vi.mock("@/lib/access", () => ({
  allUsersQuery: () => ({ queryKey: ["all-users"], queryFn: mocks.users }),
  myAccessQuery: vi.fn(),
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  from: () => ({ delete: () => ({ eq: () => ({ in: mocks.remove }) }) }),
} }));

import { Route } from "./admin";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.users.mockResolvedValue([
    { id: "self", display_name: "Beheerder", roles: ["admin"], rol: "admin", heeftToegang: true },
    { id: "other", display_name: "Collega Test", roles: ["member"], rol: "member", heeftToegang: true },
  ]);
  mocks.remove.mockResolvedValue({ error: null });
});

async function toon() {
  const Component = Route.component;
  if (!Component) throw new Error("Component ontbreekt");
  render(<QueryClientProvider client={new QueryClient()}><Component /></QueryClientProvider>);
  await screen.findByRole("combobox");
}

describe("Collega-toegang intrekken", () => {
  it("vraagt bevestiging en verwijdert alleen de rollen", async () => {
    await toon();
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "intrekken" } });
    expect(await screen.findByRole("alertdialog")).toHaveTextContent("Het account en bestaande tellingen blijven bewaard");
    expect(mocks.remove).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Toegang intrekken" }));
    await waitFor(() => expect(mocks.remove).toHaveBeenCalledWith("role", ["member"]));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
  });

  it("annuleren behoudt de toegang; eigen rol heeft geen keuzelijst", async () => {
    await toon();
    expect(screen.getAllByRole("combobox")).toHaveLength(1);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "intrekken" } });
    fireEvent.click(await screen.findByRole("button", { name: "Annuleren" }));
    expect(mocks.remove).not.toHaveBeenCalled();
  });
});