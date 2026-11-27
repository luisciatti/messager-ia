import { describe, expect, it, vi } from "vitest";
import type { AskRequest, ClaudeClient } from "../src/adapters/claude";
import { createMemoryStorage } from "../src/adapters/storage";
import { createParallelSearch, createWebSearch, mensagemErro, WebSearchError } from "../src/adapters/webSearch";
import { directKey, loadConversation, sendDirect } from "../src/core/chat";
import {
  blocoFontes, cortar, MAX_FONTES, MAX_TRECHO, montarConsultas, parseParallel, precisaFontes,
  SemFontesError, ultimaResposta, verificarNaWeb, type Fonte, type WebSearch,
} from "../src/core/fontes";
import { groupKey, sendGroup } from "../src/core/group";
import { MemoryStore } from "../src/core/memory";
import { createMeteredClient } from "../src/core/metered";
import { agents, groups } from "../src/core/registry";
import { estimateTokens, UsageLog } from "../src/core/tokens";
import { GROUP_RULE } from "../src/core/agents";
import { REPLICA_RULE } from "../src/core/replica";

const longo = "palavra ".repeat(2000); // ~16 mil caracteres, como o Parallel devolve

function payload(n = 5) {
  return {
    search_id: "x",
    results: Array.from({ length: n }, (_, i) => ({
      url: `https://site${i}.com/pagina`,
      title: `Título ${i}`,
      publish_date: "2026-10-01T00:00:00Z",
      excerpts: [longo, longo],
    })),
  };
}

function setup(reply: (r: AskRequest) => string, fontes: Fonte[] = parseParallel(payload())) {
  const requests: AskRequest[] = [];
  const client: ClaudeClient = { mode: "mock", async ask(req) { requests.push(req); return { text: reply(req), truncated: false }; } };
  const log = new UsageLog();
  const storage = createMemoryStorage();
  const buscas: { objetivo: string; consultas: string[] }[] = [];
  const web: WebSearch = { async buscar(objetivo, consultas) { buscas.push({ objetivo, consultas }); return fontes; } };
  return { requests, log, buscas, deps: { metered: createMeteredClient(client, log), storage, agents, groups, memory: new MemoryStore(storage), web } };
}

describe("parseParallel", () => {
  it("fica com no máximo 3 fontes e trechos curtos (controle de tokens)", () => {
    const f = parseParallel(payload());
    expect(f).toHaveLength(MAX_FONTES);
    for (const x of f) expect(x.trecho.length).toBeLessThanOrEqual(MAX_TRECHO + 1);
    // o bloco inteiro que entra no Claude fica por volta de 500-600 tokens
    expect(estimateTokens(blocoFontes(f))).toBeLessThan(650);
    expect(f[0].data).toBe("2026-10-01");
  });

  it("descarta link sem https, domínio repetido e resultado sem trecho", () => {
    const f = parseParallel({
      results: [
        { url: "http://inseguro.com", title: "a", excerpts: ["x"] },
        { url: "javascript:alert(1)", title: "b", excerpts: ["x"] },
        { url: "https://a.com/1", title: "c", excerpts: ["um"] },
        { url: "https://a.com/2", title: "d", excerpts: ["dois"] },
        { url: "https://b.com", title: "e", excerpts: [] },
        { url: "https://c.com", excerpts: ["sem título"] },
      ],
    });
    expect(f.map((x) => x.url)).toEqual(["https://a.com/1", "https://c.com"]);
    expect(f[1].titulo).toBe("c.com");
  });

  it("payload estranho vira lista vazia", () => {
    expect(parseParallel(null)).toEqual([]);
    expect(parseParallel({ results: "x" })).toEqual([]);
  });
});

describe("consultas e destaque (0 tokens)", () => {
  it("monta consultas curtas de palavras-chave, com a área do agente", () => {
    const c = montarConsultas("Qual é o preço do NAT Gateway por hora?", "AWS");
    expect(c.length).toBeGreaterThan(0);
    expect(c.length).toBeLessThanOrEqual(3);
    for (const q of c) expect(q.split(" ").length).toBeLessThanOrEqual(6);
    expect(c[0].startsWith("aws ")).toBe(true);
    expect(c[0]).toContain("nat");
    expect(c.some((q) => /20\d\d/.test(q))).toBe(true); // assunto que muda: consulta com o ano
  });

  it("não repete a área se a pergunta já cita", () => {
    expect(montarConsultas("limite de VCN na OCI", "OCI")[0].split(" ").filter((p) => p === "oci")).toHaveLength(1);
  });

  it("destaca só perguntas sobre o que muda", () => {
    expect(precisaFontes("qual o preço do RDS?")).toBe(true);
    expect(precisaFontes("versão atual do Terraform")).toBe(true);
    expect(precisaFontes("limite de instâncias")).toBe(true);
    expect(precisaFontes("o que é uma VPC?")).toBe(false);
  });

  it("corta no limite de palavra", () => {
    expect(cortar("a ".repeat(10), 100)).toBe("a ".repeat(10).trim());
    const c = cortar("abcdef ".repeat(200), 50);
    expect(c.endsWith("…")).toBe(true);
    expect(c).not.toMatch(/abcde…$/);
  });
});

describe("verificarNaWeb", () => {
  it("1:1: revisa a resposta no lugar, com fontes, numa chamada só", async () => {
    const { deps, requests, log, buscas } = setup((r) => (r.system.includes("fontes abaixo") ? "Custa X/h [1]." : "Custa uns Y/h."));
    await sendDirect(deps, "aws", "qual o preço do NAT Gateway?");
    const antes = await loadConversation(deps.storage, directKey("aws"));
    requests.length = 0;

    const r = await verificarNaWeb(deps, directKey("aws"));
    expect(requests).toHaveLength(1);
    expect(buscas).toHaveLength(1);
    expect(r.conversa.mensagens).toHaveLength(antes.mensagens.length); // não duplica
    const ultima = r.conversa.mensagens.at(-1)!;
    expect(ultima.content).toBe("Custa X/h [1].");
    expect(ultima.fontes).toHaveLength(3);
    expect(ultima.fontes![0]).not.toHaveProperty("trecho"); // trechos não ficam salvos
    expect(log.totalsBy("reason").fontes.calls).toBe(1);
    // o que entra no Claude: pergunta + resposta + fontes, bem abaixo de 1.200 tokens
    const req = requests[0];
    expect(req.messages).toHaveLength(1);
    expect(req.messages[0].content).toContain("[1] Título 0");
    expect(log.totalsBy("reason").fontes.inTokens).toBeLessThan(1200);
  });

  it("grupo: revisa a síntese final, não as falas internas", async () => {
    const { deps } = setup((r) =>
      r.system.includes("Escolha quais agentes") ? '{"falam":["aws","oci"],"nivel":"normal"}'
      : r.system.includes("fontes abaixo") ? "SINTESE COM FONTES [2]"
      : r.system.includes("Una as falas") ? "SINTESE" : "fala");
    await sendGroup(deps, "cloud", "versão atual do OKE e do EKS?");
    const r = await verificarNaWeb(deps, groupKey("cloud"), "cloud");
    const final = r.conversa.mensagens.at(-1)!;
    expect(final.content).toBe("SINTESE COM FONTES [2]");
    expect(final.interna).toBeFalsy();
    expect(r.conversa.mensagens.filter((m) => m.interna).every((m) => m.content === "fala")).toBe(true);
  });

  it("sem fontes úteis: não chama o Claude e não muda nada", async () => {
    const { deps, requests } = setup(() => "resp", []);
    await sendDirect(deps, "aws", "pergunta");
    requests.length = 0;
    await expect(verificarNaWeb(deps, directKey("aws"))).rejects.toBeInstanceOf(SemFontesError);
    expect(requests).toHaveLength(0);
  });

  it("ultimaResposta ignora conversa sem resposta pendente", () => {
    const conv = { id: "x", resumo: "", compactadoAte: 0, atualizadoEm: 0, mensagens: [{ role: "user" as const, content: "oi", at: 1 }] };
    expect(ultimaResposta(conv)).toBeNull();
  });
});

describe("adapter Parallel Search", () => {
  it("chama web_search com objetivo e consultas e devolve fontes recortadas", async () => {
    const callTool = vi.fn(async () => ({ payload: payload(2) }));
    const f = await createParallelSearch({ callTool }).buscar("obj", ["a b c"]);
    expect(callTool).toHaveBeenCalledWith("Parallel Search", "web_search", expect.objectContaining({ objective: "obj", search_queries: ["a b c"] }));
    expect(f).toHaveLength(2);
  });

  it("repete 1 vez só erro retryable; os outros viram mensagem própria", async () => {
    const espera = vi.fn(async () => undefined);
    let n = 0;
    const flaky = { callTool: vi.fn(async () => { if (n++ === 0) throw { code: "server_unavailable", retryable: true }; return { payload: payload(1) }; }) };
    expect(await createParallelSearch(flaky, espera).buscar("o", ["q"])).toHaveLength(1);
    expect(flaky.callTool).toHaveBeenCalledTimes(2);

    const reauth = { callTool: vi.fn(async () => { throw { code: "needs_reauth" }; }) };
    const e = await createParallelSearch(reauth, espera).buscar("o", ["q"]).catch((x) => x);
    expect(e).toBeInstanceOf(WebSearchError);
    expect(e.message).toContain("reconectado");
    expect(reauth.callTool).toHaveBeenCalledTimes(1);
  });

  it("cada código tem sua mensagem", () => {
    const msgs = ["needs_reauth", "server_not_connected", "approval_required", "server_unavailable", "tool_error", "xyz"].map((code) => mensagemErro({ code }));
    expect(new Set(msgs).size).toBe(msgs.length);
  });

  it("sem runtime: mock local; runtime sem mcp: null (botão some)", async () => {
    expect(await createWebSearch(undefined)).not.toBeNull();
    expect(await createWebSearch({ use: async () => null })).toBeNull();
  });
});

describe("limite numérico das falas internas", () => {
  it("usa palavras, não linhas", () => {
    expect(GROUP_RULE).toContain("60 palavras");
    expect(REPLICA_RULE).toContain("40 palavras");
  });
});
