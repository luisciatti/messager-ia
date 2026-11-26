import { describe, expect, it } from "vitest";
import {
  appendMessages,
  applyCompaction,
  buildContext,
  COMPACT_AT,
  compactionRequest,
  emptyConversation,
  KEEP_LAST,
  MAX_STORED,
  needsCompaction,
  parseCompaction,
  type StoredMessage,
} from "../src/core/conversation";

const msg = (i: number): StoredMessage => ({ role: i % 2 ? "assistant" : "user", content: `m${i}`, at: i });
const convWith = (n: number) => appendMessages(emptyConversation("c"), ...Array.from({ length: n }, (_, i) => msg(i)));

describe("buildContext", () => {
  it("termina com a mensagem nova do usuário", () => {
    const ctx = buildContext(convWith(2), "nova");
    expect(ctx.at(-1)).toEqual({ role: "user", content: "nova" });
  });

  it("só manda o que não foi compactado e prefixa o resumo", () => {
    const conv = { ...convWith(10), compactadoAte: 8, resumo: "RESUMO" };
    const ctx = buildContext(conv, "nova");
    expect(ctx[0].content).toContain("RESUMO");
    expect(ctx.map((m) => m.content).join()).not.toContain("m7");
  });

  it("junta mensagens seguidas do mesmo papel", () => {
    const conv = appendMessages(emptyConversation("c"), { role: "user", content: "a", at: 0 });
    const ctx = buildContext(conv, "b");
    expect(ctx).toHaveLength(1);
    expect(ctx[0].content).toBe("a\n\nb");
  });

  it("descarta assistant no início (após compactação)", () => {
    const conv = { ...convWith(4), compactadoAte: 1 };
    expect(buildContext(conv, "x")[0].role).toBe("user");
  });
});

describe("compactação", () => {
  it("dispara ao acumular COMPACT_AT mensagens", () => {
    expect(needsCompaction(convWith(COMPACT_AT - 1))).toBe(false);
    expect(needsCompaction(convWith(COMPACT_AT))).toBe(true);
  });

  it("resume as antigas e mantém as KEEP_LAST últimas", () => {
    const conv = convWith(COMPACT_AT);
    const req = compactionRequest(conv);
    expect(req.modelTier).toBe("quick");
    expect(req.messages[0].content).toContain("m0");
    expect(req.messages[0].content).not.toContain(`m${COMPACT_AT - 1}`);

    const after = applyCompaction(conv, " resumo ");
    expect(after.resumo).toBe("resumo");
    expect(after.compactadoAte).toBe(COMPACT_AT - KEEP_LAST);
    expect(needsCompaction(after)).toBe(false);
  });
});

describe("appendMessages", () => {
  it("limita o histórico guardado e ajusta o ponto compactado", () => {
    const conv = { ...convWith(MAX_STORED), compactadoAte: 10 };
    const after = appendMessages(conv, msg(1000), msg(1001));
    expect(after.mensagens).toHaveLength(MAX_STORED);
    expect(after.compactadoAte).toBe(8);
  });
});

describe("parseCompaction", () => {
  it("lê JSON mesmo com texto em volta", () => {
    expect(parseCompaction('ok {"resumo":"r","notas":["a","b","c","d"]} fim')).toEqual({ resumo: "r", notas: ["a", "b", "c"] });
  });

  it("usa o texto como resumo se não vier JSON", () => {
    expect(parseCompaction("só texto")).toEqual({ resumo: "só texto", notas: [] });
  });
});

describe("mensagens internas (falas do grupo)", () => {
  it("ficam fora do contexto e não contam para compactar", () => {
    let conv = emptyConversation("g");
    for (let i = 0; i < COMPACT_AT - 1; i++) {
      conv = appendMessages(conv, msg(i), { role: "assistant", content: `fala${i}`, at: i, interna: true });
    }
    expect(buildContext(conv, "x").map((m) => m.content).join()).not.toContain("fala");
    expect(needsCompaction(conv)).toBe(false);
  });
});
