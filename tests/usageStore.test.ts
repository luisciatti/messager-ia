import { describe, expect, it } from "vitest";
import { createMemoryStorage } from "../src/adapters/storage";
import { UsageLog } from "../src/core/tokens";
import { dayKey, loadRecentUsage, persistUsage } from "../src/core/usageStore";

const entry = (at: number, agentId = "aws") => ({
  at, agentId, reason: "resposta" as const, tier: "default" as const,
  inTokens: 10, outTokens: 5, ms: 1, truncated: false, failed: false,
});

describe("usageStore", () => {
  it("gera chave por dia", () => {
    expect(dayKey(new Date(2026, 10, 26, 15).getTime())).toBe("uso-2026-11-26");
  });

  it("salva por dia e recarrega nos próximos acessos", async () => {
    const storage = createMemoryStorage();
    const now = new Date(2026, 10, 26, 12).getTime();
    const log = new UsageLog();
    persistUsage(log, storage);
    log.add(entry(now));
    log.add(entry(now - 86_400_000, "oci"));
    await new Promise((r) => setTimeout(r, 0));

    const saved = await loadRecentUsage(storage, now);
    expect(saved).toHaveLength(2);

    const novo = new UsageLog();
    novo.hydrate(saved);
    expect(novo.totalsBy("agentId").oci.calls).toBe(1);
  });

  it("mantém entradas já salvas do dia ao gravar novas", async () => {
    const storage = createMemoryStorage();
    const now = Date.now();
    const log = new UsageLog();
    persistUsage(log, storage, [entry(now, "antigo")]);
    log.add(entry(now));
    await new Promise((r) => setTimeout(r, 0));
    expect((await loadRecentUsage(storage, now)).map((e) => e.agentId)).toEqual(["antigo", "aws"]);
  });
});
