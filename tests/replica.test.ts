import { describe, expect, it } from "vitest";
import type { AskRequest, ClaudeClient } from "../src/adapters/claude";
import { createMemoryStorage } from "../src/adapters/storage";
import { loadConversation } from "../src/core/chat";
import { groupKey, sendGroup } from "../src/core/group";
import { MemoryStore } from "../src/core/memory";
import { createMeteredClient } from "../src/core/metered";
import { agents, groups } from "../src/core/registry";
import { requestReplica } from "../src/core/replica";
import { UsageLog } from "../src/core/tokens";

const papel = (r: AskRequest) =>
  r.system.includes("Escolha quais agentes") ? "mod"
  : r.system.includes("considerando as objeções") ? "revisao"
  : r.system.includes("Una as falas") ? "sintese"
  : r.system.includes("Revise a resposta final") ? (r.system.includes("operação na OCI") ? "rev-oci" : "rev")
  : "fala";

function setup(reply: (r: AskRequest) => string) {
  const requests: AskRequest[] = [];
  const client: ClaudeClient = { mode: "mock", async ask(req) { requests.push(req); return { text: reply(req), truncated: false }; } };
  const log = new UsageLog();
  const storage = createMemoryStorage();
  return { requests, log, deps: { metered: createMeteredClient(client, log), storage, agents, groups, memory: new MemoryStore(storage) } };
}

const base = (r: AskRequest) => {
  const p = papel(r);
  return p === "mod" ? '{"falam":["aws","oci"],"nivel":"normal"}' : p === "sintese" ? "SINTESE ORIGINAL" : p === "revisao" ? "SINTESE REVISADA" : "fala";
};

describe("réplica", () => {
  it("todos concordam: nada gravado e nenhuma síntese nova", async () => {
    const { deps, log, requests } = setup((r) => (papel(r).startsWith("rev") ? "PASSO" : base(r)));
    await sendGroup(deps, "cloud", "multi-cloud para o Tasy?");
    const antes = (await loadConversation(deps.storage, groupKey("cloud"))).mensagens.length;
    requests.length = 0;

    const r = await requestReplica(deps, "cloud");
    expect(r.revisou).toBe(false);
    expect(requests).toHaveLength(3); // só os revisores
    expect((await loadConversation(deps.storage, groupKey("cloud"))).mensagens).toHaveLength(antes);
    expect(log.totalsBy("reason").sintese.calls).toBe(1); // só a original
  });

  it("revisor vê só pergunta e resposta final (debate esparso)", async () => {
    const { deps, requests } = setup((r) => (papel(r).startsWith("rev") ? "PASSO" : base(r)));
    await sendGroup(deps, "cloud", "pergunta X");
    requests.length = 0;
    await requestReplica(deps, "cloud");
    expect(requests[0].messages).toHaveLength(1);
    expect(requests[0].messages[0].content).toContain("SINTESE ORIGINAL");
    expect(requests[0].messages[0].content).not.toContain("fala");
  });

  it("com objeção: grava a objeção como interna e a síntese revisada", async () => {
    const { deps } = setup((r) => (papel(r) === "rev-oci" ? "Falta citar o Free Tier." : papel(r) === "rev" ? "PASSO" : base(r)));
    await sendGroup(deps, "cloud", "custos?");
    const r = await requestReplica(deps, "cloud");
    expect(r.revisou).toBe(true);
    expect(r.objecoes).toEqual([{ agentId: "oci", texto: "Falta citar o Free Tier." }]);
    const conv = await loadConversation(deps.storage, groupKey("cloud"));
    expect(conv.mensagens.at(-1)).toMatchObject({ content: "SINTESE REVISADA", replica: true });
    expect(conv.mensagens.at(-2)).toMatchObject({ agentId: "oci", interna: true });
  });

  it("sem resposta para revisar, recusa sem gastar", async () => {
    const { deps, requests } = setup(base);
    await expect(requestReplica(deps, "cloud")).rejects.toThrow(/nada para revisar/);
    expect(requests).toHaveLength(0);
  });
});
