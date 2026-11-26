import { describe, expect, it, vi } from "vitest";
import { estimateTokens, UsageLog } from "../src/core/tokens";

const base = {
  at: 0,
  tier: "default" as const,
  ms: 10,
  truncated: false,
  failed: false,
};

describe("estimateTokens", () => {
  it("retorna 0 para texto vazio", () => {
    expect(estimateTokens("")).toBe(0);
  });

  it("arredonda para cima (~3,5 caracteres por token)", () => {
    expect(estimateTokens("abcd")).toBe(2);
    expect(estimateTokens("a".repeat(35))).toBe(10);
  });
});

describe("UsageLog", () => {
  it("soma totais por agente e por motivo", () => {
    const log = new UsageLog();
    log.add({ ...base, agentId: "aws", reason: "resposta", inTokens: 100, outTokens: 20 });
    log.add({ ...base, agentId: "aws", reason: "resposta", inTokens: 50, outTokens: 10 });
    log.add({ ...base, agentId: "moderador", reason: "moderacao", inTokens: 30, outTokens: 5 });

    const byAgent = log.totalsBy("agentId");
    expect(byAgent.aws).toEqual({ calls: 2, inTokens: 150, outTokens: 30, total: 180 });
    expect(byAgent.moderador.total).toBe(35);
    expect(log.totals().total).toBe(215);
    expect(log.totalsBy("reason").moderacao.calls).toBe(1);
  });

  it("agrupa chamadas sem grupo como '—'", () => {
    const log = new UsageLog();
    log.add({ ...base, agentId: "aws", reason: "resposta", inTokens: 1, outTokens: 1 });
    expect(log.totalsBy("groupId")["—"].calls).toBe(1);
  });

  it("avisa os inscritos e permite cancelar", () => {
    const log = new UsageLog();
    const fn = vi.fn();
    const off = log.subscribe(fn);
    log.add({ ...base, agentId: "a", reason: "resposta", inTokens: 1, outTokens: 1 });
    off();
    log.add({ ...base, agentId: "a", reason: "resposta", inTokens: 1, outTokens: 1 });
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
