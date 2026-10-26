import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { PdfOpties } from "./PdfOpties";
import { inPdf, pdfOpties, vergeetPdfKeuzes } from "./pdfKeuzes";

describe("vinkjes voor de PDF van een portefeuille-analyse", () => {
  beforeEach(() => {
    localStorage.clear();
    vergeetPdfKeuzes();
  });

  it("standaard aan; uitvinken wordt per keuze in de browser onthouden en geldt overal", () => {
    render(
      <>
        <PdfOpties />
        <PdfOpties />
      </>,
    );
    const raming = screen.getAllByRole("checkbox", { name: "Verduurzamingsraming in de PDF" });
    const efg = screen.getAllByRole("checkbox", { name: "EFG-regels in de PDF" });
    expect([...raming, ...efg].every((c) => c.getAttribute("aria-checked") === "true")).toBe(true);
    expect(pdfOpties()).toEqual({ metRaming: true, metEfg: true });
    fireEvent.click(efg[0]!);
    expect(efg[1]).not.toBeChecked();
    expect(raming[0]).toBeChecked();
    expect(pdfOpties()).toEqual({ metRaming: true, metEfg: false });
    expect(localStorage.getItem("gohome:pdf-efg")).toBe("nee");
    fireEvent.click(raming[1]!);
    expect(pdfOpties()).toEqual({ metRaming: false, metEfg: false });
    // na herladen: de keuzes komen uit de opslag
    vergeetPdfKeuzes();
    expect(pdfOpties()).toEqual({ metRaming: false, metEfg: false });
  });

  it("opslag niet beschikbaar: standaard aan, zonder fout", () => {
    const orig = Storage.prototype.getItem;
    Storage.prototype.getItem = () => {
      throw new Error("geblokkeerd");
    };
    try {
      expect(inPdf("raming")).toBe(true);
      expect(inPdf("efg")).toBe(true);
    } finally {
      Storage.prototype.getItem = orig;
    }
  });
});
