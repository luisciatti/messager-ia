import { describe, expect, it } from "vitest";
import { routeTier } from "../src/core/routing";

describe("routeTier", () => {
  it.each([
    "o que é load balancer?",
    "Qual a diferença entre ALB e NLB?",
    "pra que serve um NAT gateway?",
    "o que significa compartment na OCI?",
  ])("simples → quick: %s", (q) => expect(routeTier(q, "default")).toBe("quick"));

  it.each([
    "estou com erro 502 no ALB",
    "o que é melhor para reduzir custo do RDS?",
    "como configurar o terraform para a VCN?",
    "o que é esse timeout no log?",
    "me ajuda a desenhar a arquitetura do Tasy",
  ])("complexo → padrão: %s", (q) => expect(routeTier(q, "default")).toBe("default"));

  it("imagem ou diagrama ficam no padrão", () => {
    expect(routeTier("o que é isso?", "default", { imagem: true })).toBe("default");
    expect(routeTier("o que é VPC?", "default", { diagrama: true })).toBe("default");
  });

  it("pergunta longa fica no padrão", () => {
    expect(routeTier("o que é " + "x ".repeat(100), "default")).toBe("default");
  });
});

import type { AskRequest, ClaudeClient } from "../src/adapters/claude";
import { createMemoryStorage } from "../src/adapters/storage";
import { directKey, loadConversation, retryLast, sendDirect } from "../src/core/chat";
import { sendGroup } from "../src/core/group";
import { MemoryStore } from "../src/core/memory";
import { createMeteredClient } from "../src/core/metered";
import { agents, groups } from "../src/core/registry";
import { UsageLog } from "../src/core/tokens";

function setup(reply: (r: AskRequest) => string = () => "ok") {
  const requests: AskRequest[] = [];
  const client: ClaudeClient = { mode: "mock", async ask(req) { requests.push(req); return { text: reply(req), truncated: false }; } };
  const storage = createMemoryStorage();
  return { requests, deps: { metered: createMeteredClient(client, new UsageLog()), storage, agents, groups, memory: new MemoryStore(storage) } };
}

describe("roteamento no fluxo", () => {
  it("1:1 conceitual vai para o leve e fica marcado na mensagem", async () => {
    const { deps, requests } = setup();
    await sendDirect(deps, "aws", "o que é load balancer?");
    expect(requests[0].modelTier).toBe("quick");
    expect((await loadConversation(deps.storage, directKey("aws"))).mensagens[1].tier).toBe("quick");
  });

  it("refazer no modelo padrão substitui a última troca", async () => {
    const { deps, requests } = setup();
    await sendDirect(deps, "aws", "o que é load balancer?");
    await retryLast(deps, "aws", "default");
    expect(requests[1].modelTier).toBe("default");
    const conv = await loadConversation(deps.storage, directKey("aws"));
    expect(conv.mensagens).toHaveLength(2);
    expect(conv.mensagens[1].tier).toBe("default");
  });

  it("grupo: moderador marca simples e todos usam o leve", async () => {
    const { deps, requests } = setup((r) =>
      r.system.includes("Escolha quais agentes") ? '{"falam":["aws","oci"],"nivel":"simples"}' : "x",
    );
    await sendGroup(deps, "cloud", "qual a diferença entre ALB e NLB?");
    const respostas = requests.filter((r) => !r.system.includes("Escolha quais agentes"));
    expect(respostas.every((r) => r.modelTier === "quick")).toBe(true);
  });

  it("grupo: nível normal mantém o tier dos agentes", async () => {
    const { deps, requests } = setup((r) =>
      r.system.includes("Escolha quais agentes") ? '{"falam":["aws"],"nivel":"normal"}' : "x",
    );
    await sendGroup(deps, "cloud", "erro 502 no ALB");
    expect(requests.at(-1)!.modelTier).toBe("default");
  });
});
