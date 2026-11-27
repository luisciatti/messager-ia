import { describe, expect, it } from "vitest";
import type { AskRequest, ClaudeClient } from "../src/adapters/claude";
import { createMemoryStorage } from "../src/adapters/storage";
import { directKey, loadConversation, sendDirect } from "../src/core/chat";
import { closeTopic, closingTranscript, parseClosing } from "../src/core/closing";
import { appendMessages, applyCompaction, emptyConversation, visibleFrom, type Conversation } from "../src/core/conversation";
import { MemoryStore, mergeDoc } from "../src/core/memory";
import { createMeteredClient } from "../src/core/metered";
import { agents } from "../src/core/registry";
import { UsageLog } from "../src/core/tokens";

const DOC_JSON = JSON.stringify({
  notas: ["ALB do Tasy usa health check em /health"],
  doc: { titulo: "Erro 502 no ALB do Tasy", conteudo: "**Causa:** target group unhealthy.\n- Ajustar health check para /health", tags: ["alb", "502"] },
});

function setup(closing = DOC_JSON) {
  const requests: AskRequest[] = [];
  const client: ClaudeClient = {
    mode: "mock",
    async ask(req) {
      requests.push(req);
      return { text: req.system.includes("arquiva um assunto") ? closing : "resposta", truncated: false };
    },
  };
  const log = new UsageLog();
  const storage = createMemoryStorage();
  const memory = new MemoryStore(storage);
  return { requests, log, memory, deps: { metered: createMeteredClient(client, log), storage, agents, memory } };
}

describe("parseClosing", () => {
  it("lê notas e doc", () => {
    const r = parseClosing(`ok ${DOC_JSON}`);
    expect(r.notas).toHaveLength(1);
    expect(r.doc?.titulo).toBe("Erro 502 no ALB do Tasy");
  });

  it("aceita doc null e lixo", () => {
    expect(parseClosing('{"notas":[],"doc":null}')).toEqual({ notas: [], doc: null });
    expect(parseClosing("sem json")).toEqual({ notas: [], doc: null });
  });
});

describe("closingTranscript", () => {
  it("corta o início quando o trecho é grande, mantendo o fim", () => {
    const conv = appendMessages(emptyConversation("c"), { role: "user", content: "x".repeat(20000), at: 0 }, { role: "assistant", content: "FIM", at: 1 });
    const t = closingTranscript(conv);
    expect(t.length).toBeLessThan(1500 * 3.5 + 100);
    expect(t).toContain("FIM");
  });

  it("não duplica: o que foi compactado entra só pelo resumo", () => {
    let c: Conversation = emptyConversation("c");
    for (let i = 0; i < 8; i++) c = appendMessages(c, { role: "user", content: `PERGUNTA_${i}`, at: i }, { role: "assistant", content: `RESPOSTA_${i}`, at: i });
    c = applyCompaction(c, "RESUMO");
    const t = closingTranscript(c);
    expect(t).toContain("RESUMO");
    expect(t).not.toContain("PERGUNTA_0");
    expect(t).toContain("PERGUNTA_7");
  });

  it("encurta respostas antigas e mantém as 2 últimas inteiras", () => {
    let c: Conversation = emptyConversation("c");
    for (let i = 0; i < 3; i++) c = appendMessages(c, { role: "user", content: `p${i}`, at: i }, { role: "assistant", content: `R${i}` + "x".repeat(800), at: i });
    const t = closingTranscript(c);
    expect(t).toContain("R0" + "x".repeat(298) + "…");
    expect(t).toContain("R2" + "x".repeat(800));
    expect(t).toContain("R1" + "x".repeat(800));
  });
});

describe("/clear", () => {
  it("arquiva notas e doc numa chamada só, oculta e tira do contexto", async () => {
    const { deps, requests, log } = setup();
    await sendDirect(deps, "aws", "estou com 502 no ALB do Tasy");
    await sendDirect(deps, "aws", "ajustei o health check e resolveu");

    const r = await closeTopic(deps, directKey("aws"), "aws", "clear");
    expect(r.chamou).toBe(true);
    expect(r.notas).toBe(1);
    expect(r.doc?.titulo).toContain("502");
    expect(log.totalsBy("agentId").memoria.calls).toBe(1);

    const conv = await loadConversation(deps.storage, directKey("aws"));
    expect(visibleFrom(conv)).toBe(4);

    requests.length = 0;
    await sendDirect(deps, "aws", "outra coisa: custo do S3?");
    const ctx = JSON.stringify(requests[0].messages);
    expect(ctx).not.toContain("502 no ALB");
    expect(requests[0].system).not.toContain("Erro 502"); // doc só entra se relevante
  });

  it("doc arquivado volta quando o assunto reaparece", async () => {
    const { deps, requests } = setup();
    await sendDirect(deps, "aws", "502 no ALB do Tasy");
    await sendDirect(deps, "aws", "resolvido");
    await closeTopic(deps, directKey("aws"), "aws", "clear");
    requests.length = 0;

    const r = await sendDirect(deps, "aws", "deu 502 no ALB de novo");
    expect(requests[0].system).toContain("[Erro 502 no ALB do Tasy]");
    expect(r.docsUsados).toEqual(["Erro 502 no ALB do Tasy"]);
  });

  it("pergunta genérica: sem doc quando o modelo devolve null", async () => {
    const { deps, memory } = setup('{"notas":[],"doc":null}');
    await sendDirect(deps, "aws", "o que é load balancer?");
    const r = await closeTopic(deps, directKey("aws"), "aws", "clear");
    expect(r.doc).toBeUndefined();
    expect((await memory.load()).docs).toHaveLength(0);
  });

  it("conversa vazia: limpa sem gastar chamada", async () => {
    const { deps, log } = setup();
    const r = await closeTopic(deps, directKey("aws"), "aws", "clear");
    expect(r.chamou).toBe(false);
    expect(log.entries()).toHaveLength(0);
  });
});

describe("/doc", () => {
  it("força o doc e não limpa a conversa", async () => {
    const { deps, requests } = setup();
    await sendDirect(deps, "oci", "como criar compartment?");
    const r = await closeTopic(deps, directKey("oci"), "oci", "doc");
    expect(requests.at(-1)!.system).toContain("obrigatório");
    expect(r.doc).toBeDefined();
    expect(visibleFrom(await loadConversation(deps.storage, directKey("oci")))).toBe(0);
  });
});

describe("mergeDoc", () => {
  it("atualiza doc de título parecido em vez de duplicar", () => {
    const base = { conteudo: "a", tags: [], agentId: "aws" };
    const r1 = mergeDoc([], { ...base, titulo: "Erro 502 no ALB", criadaEm: 1 });
    const r2 = mergeDoc(r1.docs, { ...base, titulo: "Erro 502 no ALB do Tasy", conteudo: "b", criadaEm: 2 });
    expect(r2.docs).toHaveLength(1);
    expect(r2.doc).toMatchObject({ id: r1.doc.id, conteudo: "b", criadaEm: 1, atualizadoEm: 2 });
  });
});
