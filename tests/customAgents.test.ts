import { describe, expect, it } from "vitest";
import { createMemoryStorage } from "../src/adapters/storage";
import { buildCustomAgent, loadCustomAgents, mergeCustom, removeCustomAgent, saveCustomAgent, slug, validar } from "../src/core/customAgents";
import { agents, groups } from "../src/core/registry";

const tasy = { nome: "Tasy", escopo: "operação do Tasy na OCI", checklist: "banco Oracle, janelas de manutenção", skills: ["tasy", "oracle"], grupos: [] };

describe("agentes criados pela interface", () => {
  it("gera id estável e instruções no formato dos agentes do repo", () => {
    expect(slug("Redes & Segurança")).toBe("c-redes-seguranca");
    const a = buildCustomAgent(tasy);
    expect(a).toMatchObject({ id: "c-tasy", papel: "especialista", estilo: "caveman", custom: true });
    expect(a.instrucoes).toContain("Escopo: operação do Tasy na OCI.");
    expect(a.instrucoes).toContain("Não invente");
  });

  it("valida o teto de tokens e conflito com agente do repo", () => {
    expect(validar(buildCustomAgent(tasy), agents).ok).toBe(true);
    const grande = buildCustomAgent({ ...tasy, escopo: "x ".repeat(400) });
    expect(validar(grande, agents).erros.join()).toMatch(/grande demais/);
  });

  it("salva, lista e remove", async () => {
    const s = createMemoryStorage();
    await saveCustomAgent(s, buildCustomAgent(tasy));
    expect((await loadCustomAgents(s)).map((a) => a.id)).toEqual(["c-tasy"]);
    await removeCustomAgent(s, "c-tasy");
    expect(await loadCustomAgents(s)).toEqual([]);
  });

  it("entra no grupo só quando escolhido, sem alterar os originais", () => {
    const dentro = buildCustomAgent({ ...tasy, grupos: ["cloud"] });
    const fora = buildCustomAgent({ ...tasy, nome: "Redes", grupos: [] });
    const r = mergeCustom(agents, groups, [dentro, fora]);
    expect(r.agents.has("c-tasy") && r.agents.has("c-redes")).toBe(true);
    expect(r.groups.get("cloud")!.membros).toEqual(["aws", "oci", "devops", "c-tasy"]);
    expect(groups.get("cloud")!.membros).toEqual(["aws", "oci", "devops"]);
  });
});
