import { describe, expect, it } from "vitest";
import type { ClaudeClient } from "../src/adapters/claude";
import { BudgetExceededError, BudgetTracker } from "../src/core/budget";
import { createMeteredClient, estimateRequestTokens } from "../src/core/metered";
import { UsageLog } from "../src/core/tokens";

const fakeClient = (text: string, fail = false): ClaudeClient & { calls: number } => {
  const c = {
    mode: "mock" as const,
    calls: 0,
    async ask() {
      c.calls++;
      if (fail) throw new Error("rate_limited");
      return { text, truncated: false };
    },
  };
  return c;
};

const req = { system: "Você é AWS.", messages: [{ role: "user" as const, content: "Como faço backup do RDS?" }] };
const meta = { agentId: "aws", reason: "resposta" as const };

describe("createMeteredClient", () => {
  it("registra a chamada no log com tokens estimados", async () => {
    const log = new UsageLog();
    const client = createMeteredClient(fakeClient("Use snapshots automáticos."), log);
    await client.ask(req, meta);

    const [entry] = log.entries();
    expect(entry.agentId).toBe("aws");
    expect(entry.inTokens).toBe(estimateRequestTokens(req));
    expect(entry.outTokens).toBeGreaterThan(0);
    expect(entry.failed).toBe(false);
  });

  it("não chama o Claude se o orçamento não comportar", async () => {
    const log = new UsageLog();
    const inner = fakeClient("ok");
    const client = createMeteredClient(inner, log);
    const budget = new BudgetTracker({ maxCalls: 5, maxTokens: 5 });

    await expect(client.ask(req, meta, budget)).rejects.toBeInstanceOf(BudgetExceededError);
    expect(inner.calls).toBe(0);
    expect(log.entries()).toHaveLength(0);
  });

  it("conta a entrada mesmo quando a chamada falha", async () => {
    const log = new UsageLog();
    const budget = new BudgetTracker({ maxCalls: 5, maxTokens: 10_000 });
    const client = createMeteredClient(fakeClient("", true), log);

    await expect(client.ask(req, meta, budget)).rejects.toThrow("rate_limited");
    expect(budget.usedCalls).toBe(1);
    expect(log.entries()[0].failed).toBe(true);
  });
});
