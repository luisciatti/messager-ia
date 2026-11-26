import { describe, expect, it } from "vitest";
import { BudgetExceededError, BudgetTracker } from "../src/core/budget";

describe("BudgetTracker", () => {
  it("permite chamadas dentro do orçamento", () => {
    const b = new BudgetTracker({ maxCalls: 2, maxTokens: 100 });
    b.assertCanCall(40);
    b.record(40, 10);
    expect(b.usedCalls).toBe(1);
    expect(b.remainingTokens).toBe(50);
  });

  it("bloqueia ao passar do número de chamadas", () => {
    const b = new BudgetTracker({ maxCalls: 1, maxTokens: 1000 });
    b.record(10, 10);
    expect(() => b.assertCanCall(10)).toThrow(BudgetExceededError);
  });

  it("bloqueia quando a entrada estourar os tokens", () => {
    const b = new BudgetTracker({ maxCalls: 5, maxTokens: 100 });
    b.record(60, 20);
    try {
      b.assertCanCall(30);
      throw new Error("deveria ter falhado");
    } catch (e) {
      expect(e).toBeInstanceOf(BudgetExceededError);
      expect((e as BudgetExceededError).kind).toBe("tokens");
    }
  });
});
