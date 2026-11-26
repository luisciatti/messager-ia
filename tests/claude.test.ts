import { describe, expect, it, vi } from "vitest";
import {
  buildInput,
  createArtifactClient,
  createClaudeClient,
} from "../src/adapters/claude";

describe("buildInput", () => {
  it("coloca as instruções na primeira mensagem", () => {
    const input = buildInput({
      system: "Você é o agente AWS.",
      messages: [{ role: "user", content: "Oi" }],
    });
    expect(input[0].content).toContain("Você é o agente AWS.");
    expect(input[0].content).toContain("Oi");
  });

  it("exige que o histórico termine com o usuário", () => {
    expect(() =>
      buildInput({ system: "x", messages: [{ role: "assistant", content: "a" }] }),
    ).toThrow();
  });
});

describe("createClaudeClient", () => {
  it("cai no mock fora do artifact", async () => {
    const client = await createClaudeClient(undefined);
    expect(client.mode).toBe("mock");
    const res = await client.ask({ system: "x", messages: [{ role: "user", content: "teste" }] });
    expect(res.text).toContain("teste");
  });

  it("cai no mock quando o sample não está disponível", async () => {
    const client = await createClaudeClient({ use: async () => null });
    expect(client.mode).toBe("mock");
  });

  it("usa o sample dentro do artifact, sem cache e com tier padrão", async () => {
    const sample = vi.fn().mockResolvedValue({ text: "resposta", truncated: false });
    const client = createArtifactClient(sample);
    const res = await client.ask({ system: "x", messages: [{ role: "user", content: "oi" }] });
    expect(res.text).toBe("resposta");
    expect(sample.mock.calls[0][1]).toMatchObject({ modelTier: "default", cache: false });
  });
});
