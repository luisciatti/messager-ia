import { describe, expect, it, vi } from "vitest";
import {
  mockReply,
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

describe("mockReply", () => {
  it("imita o moderador escolhendo por palavra-chave", () => {
    const txt = mockReply({
      system: 'Formato: {"falam":["id"]}',
      messages: [{ role: "user", content: "Agentes:\naws: custos, rds\noci: vcn\ndevops: terraform\n\nPergunta: backup do rds com terraform" }],
    });
    expect(JSON.parse(txt).falam).toEqual(["aws", "devops"]);
  });

  it("devolve JSON no resumo", () => {
    const txt = mockReply({ system: "Resuma a conversa em até 120 palavras", messages: [{ role: "user", content: "x" }] });
    expect(JSON.parse(txt)).toHaveProperty("resumo");
  });
});
