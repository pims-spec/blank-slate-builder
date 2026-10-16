import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ invite: vi.fn() }));
vi.mock("@tanstack/react-start", () => ({ useServerFn: () => mocks.invite }));
vi.mock("@/lib/uitnodigen.functions", () => ({ nodigCollegaUit: vi.fn() }));
import { CollegaUitnodigen } from "./CollegaUitnodigen";

beforeEach(() => { vi.clearAllMocks(); });
async function open() {
  render(<QueryClientProvider client={new QueryClient()}><CollegaUitnodigen /></QueryClientProvider>);
  fireEvent.click(screen.getByRole("button", { name: "Collega uitnodigen" }));
  await screen.findByRole("dialog");
}
describe("Collega uitnodigen", () => {
  it("verstuurt het e-mailadres met de gekozen rol en sluit daarna", async () => {
    mocks.invite.mockResolvedValue({ email: "collega@example.com" });
    await open();
    fireEvent.change(screen.getByLabelText("E-mailadres"), { target: { value: "collega@example.com" } });
    fireEvent.change(screen.getByLabelText("Rol"), { target: { value: "viewer" } });
    fireEvent.click(screen.getByRole("button", { name: "Uitnodiging versturen" }));
    await waitFor(() => expect(mocks.invite).toHaveBeenCalledWith({ data: { email: "collega@example.com", rol: "viewer" } }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });
  it("bewaart de invoer bij een fout zodat opnieuw proberen mogelijk is", async () => {
    mocks.invite.mockRejectedValue(new Error("Uitnodigen is niet gelukt."));
    await open();
    fireEvent.change(screen.getByLabelText("E-mailadres"), { target: { value: "collega@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Uitnodiging versturen" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Uitnodigen is niet gelukt.");
    expect(screen.getByLabelText("E-mailadres")).toHaveValue("collega@example.com");
    expect(screen.getByRole("button", { name: "Uitnodiging versturen" })).toBeEnabled();
  });
});