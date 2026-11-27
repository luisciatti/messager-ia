import { describe, expect, it } from "vitest";
import { fitImage, visualTokens } from "../src/core/images";

describe("imagens", () => {
  it("conta tokens por blocos de 28px", () => {
    expect(visualTokens(28, 28)).toBe(1);
    expect(visualTokens(1000, 560)).toBe(36 * 20);
  });

  it("reduz print Full HD até caber no teto, mantendo a proporção", () => {
    const r = fitImage(1920, 1080);
    expect(r.tokens).toBeLessThanOrEqual(1000);
    expect(r.width / r.height).toBeCloseTo(1920 / 1080, 1);
  });

  it("não aumenta imagem pequena", () => {
    expect(fitImage(400, 300)).toEqual({ width: 400, height: 300, tokens: 15 * 11 });
  });
});
