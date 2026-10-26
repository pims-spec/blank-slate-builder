import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { RamingVinkje } from "./RamingVinkje";
import { ramingInPdf, vergeetRamingKeuze } from "./ramingKeuze";

describe("vinkje verduurzamingsraming in de PDF", () => {
  beforeEach(() => {
    localStorage.clear();
    vergeetRamingKeuze();
  });

  it("standaard aan; uitvinken wordt in de browser onthouden en geldt overal", () => {
    render(
      <>
        <RamingVinkje />
        <RamingVinkje />
      </>,
    );
    const [a, b] = screen.getAllByRole("checkbox", { name: "Verduurzamingsraming in de PDF" });
    expect(a).toBeChecked();
    expect(ramingInPdf()).toBe(true);
    fireEvent.click(a!);
    expect(a).not.toBeChecked();
    expect(b).not.toBeChecked();
    expect(ramingInPdf()).toBe(false);
    expect(localStorage.getItem("gohome:pdf-raming")).toBe("nee");
    // na herladen: de keuze komt uit de opslag
    vergeetRamingKeuze();
    expect(ramingInPdf()).toBe(false);
  });

  it("opslag niet beschikbaar: standaard aan, zonder fout", () => {
    const orig = Storage.prototype.getItem;
    Storage.prototype.getItem = () => {
      throw new Error("geblokkeerd");
    };
    try {
      expect(ramingInPdf()).toBe(true);
    } finally {
      Storage.prototype.getItem = orig;
    }
  });
});
