import { describe, expect, it } from "vitest";
import { buildSystemPrompt, compactBody, parseAgent, STYLE_RULES, USER_STYLE } from "../src/core/agents";
import { agents } from "../src/core/registry";
import { estimateTokens } from "../src/core/tokens";

/**
 * Teto de tokens do system prompt por papel. O system vai em TODA chamada,
 * então este teste reprova o PR se alguém engordar um agente.
 */
const MAX_SYSTEM_TOKENS = { especialista: 160, moderador: 80, sintese: 120 } as const;
const MAX_DIRECT_TOKENS = 190;

const sample = `---
id: x
nome: X
papel: especialista
tier: default
estilo: caveman
skills: [a, b]
---
<!-- comentário -->
Linha 1

  Linha 2
`;

describe("parseAgent", () => {
  it("lê frontmatter e remove comentários do corpo", () => {
    const a = parseAgent(sample);
    expect(a).toMatchObject({ id: "x", tier: "default", estilo: "caveman", skills: ["a", "b"] });
    expect(a.instrucoes).toBe("Linha 1\nLinha 2");
  });

  it("aceita quebra de linha do Windows", () => {
    expect(parseAgent(sample.replace(/\n/g, "\r\n")).id).toBe("x");
  });

  it("rejeita valores inválidos", () => {
    expect(() => parseAgent(sample.replace("tier: default", "tier: turbo"))).toThrow(/tier/);
    expect(() => parseAgent("sem frontmatter")).toThrow(/frontmatter/);
  });
});

describe("compactBody", () => {
  it("remove comentários de várias linhas", () => {
    expect(compactBody("<!--\na\nb\n-->\nok")).toBe("ok");
  });
});

describe("buildSystemPrompt", () => {
  it("só adiciona a regra de grupo para especialistas no grupo", () => {
    const a = parseAgent(sample);
    expect(buildSystemPrompt(a, "grupo")).toContain("PASSO");
    expect(buildSystemPrompt(a, "direto")).not.toContain("PASSO");
    expect(buildSystemPrompt(a, "grupo")).toContain(STYLE_RULES.caveman);
  });

  it("o que o usuário lê usa sempre o estilo conciso com pergunta", () => {
    const a = parseAgent(sample);
    expect(buildSystemPrompt(a, "direto")).toContain(USER_STYLE);
    expect(buildSystemPrompt(a, "direto")).not.toContain(STYLE_RULES.caveman);
  });
});

describe("agentes do repositório", () => {
  it("tem os agentes iniciais", () => {
    expect([...agents.keys()].sort()).toEqual(["aws", "devops", "moderador", "oci", "sintetizador"]);
  });

  it("moderador usa o tier mais leve", () => {
    expect(agents.get("moderador")!.tier).toBe("quick");
  });

  for (const [id, agent] of agents) {
    it(`${id}: system prompt dentro do teto de tokens (grupo e 1:1)`, () => {
      expect(estimateTokens(buildSystemPrompt(agent, "grupo"))).toBeLessThanOrEqual(MAX_SYSTEM_TOKENS[agent.papel]);
      expect(estimateTokens(buildSystemPrompt(agent, "direto"))).toBeLessThanOrEqual(MAX_DIRECT_TOKENS);
    });
  }
});
