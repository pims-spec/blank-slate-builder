import { describe, expect, it } from "vitest";
import { histogram } from "./dashboard";

describe("histogram (puntenverdeling)", () => {
  it("leeg zonder tellingen", () => {
    expect(histogram([], 186)).toEqual([]);
  });

  it("emmers van 20, minstens tot voorbij de grens", () => {
    const h = histogram([0, 19, 20, 150], 186);
    expect(h[0]).toEqual({ van: 0, n: 2 });
    expect(h[1]).toEqual({ van: 20, n: 1 });
    expect(h[7]).toEqual({ van: 140, n: 1 });
    // tot (186 + 20) → 11 emmers (0..200)
    expect(h).toHaveLength(11);
  });

  it("hoge en negatieve totalen vallen in de rand-emmers", () => {
    const h = histogram([-5, 300], 186);
    expect(h[0]!.n).toBe(1);
    expect(h.at(-1)).toEqual({ van: 300, n: 1 });
  });
});
