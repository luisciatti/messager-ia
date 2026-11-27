import { describe, expect, it } from "vitest";
import { createMemoryStorage } from "../src/adapters/storage";
import { appendMessages, emptyConversation } from "../src/core/conversation";
import { loadFeedback, stats, votar } from "../src/core/feedback";
import { DEFAULT_CONFIG, loadConfig, saveConfig, statusMeta } from "../src/core/settings";

describe("meta diária", () => {
  it("classifica ok, alerta (80%) e estourado (100%)", () => {
    expect(statusMeta(1000, 20000).nivel).toBe("ok");
    expect(statusMeta(16000, 20000).nivel).toBe("alerta");
    expect(statusMeta(20000, 20000).nivel).toBe("estourado");
  });

  it("salva com mínimo razoável e carrega com padrão", async () => {
    const s = createMemoryStorage();
    expect(await loadConfig(s)).toEqual(DEFAULT_CONFIG);
    await saveConfig(s, { metaDiaria: 10, pausarNaMeta: true });
    expect(await loadConfig(s)).toEqual({ metaDiaria: 1000, pausarNaMeta: true });
  });
});

describe("feedback", () => {
  const conv = appendMessages(
    emptyConversation("conv-direto-aws"),
    { role: "user", content: "p", at: 1 },
    { role: "assistant", content: "r", at: 2, agentId: "aws", tier: "quick", tokens: 50 },
  );

  it("registra o voto na mensagem e na lista, e desfaz se repetir", async () => {
    const s = createMemoryStorage();
    const c1 = await votar(s, "conv-direto-aws", conv, 1, 1);
    expect(c1.mensagens[1].feedback).toBe(1);
    expect(await loadFeedback(s)).toMatchObject([{ agentId: "aws", tier: "quick", valor: 1 }]);

    const c2 = await votar(s, "conv-direto-aws", c1, 1, 1);
    expect(c2.mensagens[1].feedback).toBeUndefined();
    expect(await loadFeedback(s)).toHaveLength(0);
  });

  it("troca o voto sem duplicar", async () => {
    const s = createMemoryStorage();
    const c1 = await votar(s, "k", conv, 1, 1);
    await votar(s, "k", c1, 1, -1);
    expect((await loadFeedback(s)).map((i) => i.valor)).toEqual([-1]);
  });

  it("ignora voto em mensagem do usuário", async () => {
    const s = createMemoryStorage();
    expect(await votar(s, "k", conv, 0, 1)).toBe(conv);
  });

  it("calcula aprovação por agente e por tier", () => {
    const base = { id: "", at: 0, tokens: 0 };
    const r = stats(
      [
        { ...base, agentId: "aws", tier: "quick", valor: 1 },
        { ...base, agentId: "aws", tier: "default", valor: -1 },
        { ...base, agentId: "oci", tier: "quick", valor: 1 },
      ],
      (i) => i.tier,
    );
    expect(r.quick).toEqual({ up: 2, down: 0, aprovacao: 1 });
    expect(r.default.aprovacao).toBe(0);
  });
});
