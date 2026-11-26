import { describe, expect, it } from "vitest";
import { buildSystemPrompt, compactBody, parseAgent, STYLE_RULES } from "../src/core/agents";
import { agents } from "../src/core/registry";
import { estimateTokens } from "../src/core/tokens";

/**
 * Teto de tokens do system prompt por papel. O system vai em TODA chamada,
 * então este teste reprova o PR se alguém engordar um agente.
 */
const MAX_SYSTEM_TOKENS = { especialista: 160, moderador: 80, sintese: 80 } as const;

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
    expect(buildSystemPrompt(a, "direto")).toContain(STYLE_RULES.caveman);
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
    it(`${id}: system prompt dentro do teto de tokens`, () => {
      const tokens = estimateTokens(buildSystemPrompt(agent, "grupo"));
      expect(tokens).toBeLessThanOrEqual(MAX_SYSTEM_TOKENS[agent.papel]);
    });
  }
});
