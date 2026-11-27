import { describe, expect, it } from "vitest";
import type { AskRequest, ClaudeClient } from "../src/adapters/claude";
import { createMemoryStorage } from "../src/adapters/storage";
import { directKey, loadConversation, sendDirect } from "../src/core/chat";
import { groupKey, sendGroup } from "../src/core/group";
import { MemoryStore } from "../src/core/memory";
import { createMeteredClient } from "../src/core/metered";
import { agents, groups } from "../src/core/registry";
import { UsageLog } from "../src/core/tokens";

function setup(reply: (r: AskRequest) => string = () => "ok") {
  const requests: AskRequest[] = [];
  const client: ClaudeClient = {
    mode: "mock",
    async ask(req) {
      requests.push(req);
      return { text: reply(req), truncated: false };
    },
  };
  const log = new UsageLog();
  const storage = createMemoryStorage();
  return { requests, log, deps: { metered: createMeteredClient(client, log), storage, agents, groups, memory: new MemoryStore(storage) } };
}

const imagem = { blob: new Blob(["x"], { type: "image/png" }), tokens: 720, url: "data:image/png;base64,AA" };

describe("imagem no 1:1", () => {
  it("envia a imagem uma vez, conta os tokens e não a reenvia no histórico", async () => {
    const { deps, requests, log } = setup();
    await sendDirect(deps, "aws", "", undefined, { imagem });

    expect(requests[0].images).toHaveLength(1);
    expect(requests[0].messages.at(-1)!.content).toContain("Imagem enviada sem texto");
    expect(log.entries()[0].inTokens).toBeGreaterThan(720);

    const conv = await loadConversation(deps.storage, directKey("aws"));
    expect(conv.mensagens[0].imagem).toEqual({ url: imagem.url, tokens: 720 });

    await sendDirect(deps, "aws", "e agora?");
    expect(requests[1].images).toBeUndefined();
    expect(JSON.stringify(requests[1].messages)).toContain("[imagem anexada]");
  });

  it("só pede diagrama quando o usuário liga a opção", async () => {
    const { deps, requests } = setup();
    await sendDirect(deps, "aws", "o que é load balancer?");
    await sendDirect(deps, "aws", "desenha pra mim", undefined, { diagrama: true });
    expect(requests[0].system).not.toContain("mermaid");
    expect(requests[1].system).toContain("mermaid");
  });
});

describe("imagem no grupo", () => {
  it("sem menção: descreve uma vez e os agentes recebem só texto", async () => {
    const { deps, requests, log } = setup((r) =>
      r.system.includes("Descreva a imagem") ? "Erro 502 no ALB"
      : r.system.includes("Escolha quais agentes") ? '{"falam":["aws","devops"]}'
      : "fala",
    );
    await sendGroup(deps, "cloud", "o que é esse erro?", undefined, { imagem });

    expect(log.totalsBy("reason").visao.calls).toBe(1);
    expect(requests.filter((r) => r.images?.length)).toHaveLength(1);
    expect(requests.find((r) => r.system.includes("Escolha quais agentes"))!.messages[0].content).toContain("Erro 502");
    const conv = await loadConversation(deps.storage, groupKey("cloud"));
    expect(conv.mensagens[0].imagem?.descricao).toBe("Erro 502 no ALB");
  });

  it("@menção de 1 agente: imagem vai direto, sem chamada de descrição", async () => {
    const { deps, requests, log } = setup();
    await sendGroup(deps, "cloud", "@aws o que é isso?", undefined, { imagem });
    expect(log.totalsBy("reason").visao).toBeUndefined();
    expect(requests).toHaveLength(1);
    expect(requests[0].images).toHaveLength(1);
  });

  it("diagrama vai só para quem fala com o usuário (síntese), não para as falas internas", async () => {
    const { deps, requests } = setup((r) => (r.system.includes("Escolha quais agentes") ? '{"falam":["aws","oci"]}' : "x"));
    await sendGroup(deps, "cloud", "arquitetura multi-cloud", undefined, { diagrama: true });
    const comMermaid = requests.filter((r) => r.system.includes("mermaid"));
    expect(comMermaid).toHaveLength(1);
    expect(comMermaid[0].system).toContain("Una as falas");
  });
});
