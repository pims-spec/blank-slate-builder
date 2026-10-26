// Alleen voor tests: het menu "⋯" van een rij (RijActies) openen en een keuze maken.
import { fireEvent, screen, waitFor } from "@testing-library/react";

/** Opent het menu achter `knop` (met het toetsenbord, zoals Radix dat in jsdom ondersteunt) */
export async function openMenu(knop: HTMLElement): Promise<HTMLElement> {
  // Enter wisselt open en dicht: alleen drukken als het menu nog dicht is
  if (knop.getAttribute("aria-expanded") !== "true") fireEvent.keyDown(knop, { key: "Enter" });
  await waitFor(() => expect(knop).toHaveAttribute("aria-expanded", "true"));
  return screen.findByRole("menu");
}

/** Sluit het open menu achter `knop` en wacht tot het weg is */
export async function sluitMenu(knop: HTMLElement): Promise<void> {
  fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" });
  await waitFor(() => expect(knop).toHaveAttribute("aria-expanded", "false"));
  await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
}

/** De keuzes in het menu achter `knop`; het menu is daarna weer dicht */
export async function menuKeuzes(knop: HTMLElement): Promise<string[]> {
  const menu = await openMenu(knop);
  const namen = Array.from(menu.querySelectorAll('[role="menuitem"]')).map(
    (m) => m.textContent ?? "",
  );
  await sluitMenu(knop);
  return namen;
}

/** Kiest `label` in het menu achter `knop` */
export async function kiesInMenu(knop: HTMLElement, label: string): Promise<void> {
  const menu = await openMenu(knop);
  const keuze = Array.from(menu.querySelectorAll<HTMLElement>('[role="menuitem"]')).find(
    (m) => m.textContent === label,
  );
  if (!keuze) throw new Error(`Geen menukeuze "${label}"`);
  fireEvent.click(keuze);
}
