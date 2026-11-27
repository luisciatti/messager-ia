import { describe, expect, it } from "vitest";
import type { AskRequest, ClaudeClient } from "../src/adapters/claude";
import { createMemoryStorage } from "../src/adapters/storage";
import { loadConversation } from "../src/core/chat";
import { groupKey, isPass, parseMentions, parseModerator, sendGroup } from "../src/core/group";
import { MemoryStore } from "../src/core/memory";
import { createMeteredClient } from "../src/core/metered";
import { agents, groups } from "../src/core/registry";
import { UsageLog } from "../src/core/tokens";

type Reply = (req: AskRequest) => string;

function setup(reply: Reply) {
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
  const deps = { metered: createMeteredClient(client, log), storage, agents, groups, memory: new MemoryStore(storage) };
  return { deps, log, requests };
}

const who = (req: AskRequest) =>
  req.system.includes("Escolha quais agentes") ? "moderador"
  : req.system.includes("Una as falas") ? "sintese"
  : req.system.includes("operação na AWS") ? "aws"
  : req.system.includes("operação na OCI") ? "oci"
  : "devops";

describe("helpers", () => {
  it("lê menções só de membros", () => {
    expect(parseMentions("@AWS e @devops, e @gcp?", ["aws", "oci", "devops"])).toEqual(["aws", "devops"]);
  });

  it("lê a resposta do moderador e ignora ids estranhos", () => {
    expect(parseModerator('```json\n{"falam":["oci","gcp","aws"],"motivo":"x"}\n```', ["aws", "oci", "devops"], 3)).toEqual(["aws", "oci"]);
    expect(parseModerator("sem json", ["aws"], 3)).toEqual([]);
  });

  it("reconhece PASSO", () => {
    expect(isPass("PASSO")).toBe(true);
    expect(isPass("**Passo**.")).toBe(true);
    expect(isPass("Passos: 1) ...")).toBe(false);
  });
});

describe("sendGroup", () => {
  it("moderador escolhe 2, eles falam e a síntese une (4 chamadas)", async () => {
    const { deps, log } = setup((req) => {
      const w = who(req);
      if (w === "moderador") return '{"falam":["aws","devops"],"motivo":"backup e pipeline"}';
      if (w === "sintese") return "Conclusão unida.";
      return `posição ${w}`;
    });
    const r = await sendGroup(deps, "cloud", "Como automatizar backup do RDS?");

    expect(r.falantes).toEqual(["aws", "devops"]);
    expect(r.sintetizou).toBe(true);
    expect(log.entries()).toHaveLength(4);
    expect(log.totalsBy("reason").moderacao.calls).toBe(1);
    const conv = await loadConversation(deps.storage, groupKey("cloud"));
    expect(conv.mensagens.at(-1)!.content).toBe("Conclusão unida.");
    expect(conv.mensagens.filter((m) => m.interna)).toHaveLength(2);
  });

  it("@menção pula o moderador; 1 falante responde em linguagem normal, sem síntese", async () => {
    const { deps, log, requests } = setup(() => "resposta");
    const r = await sendGroup(deps, "cloud", "@oci qual shape usar?");

    expect(r.viaMencao).toBe(true);
    expect(r.sintetizou).toBe(false);
    expect(log.entries()).toHaveLength(1);
    expect(requests[0].system).not.toContain("PASSO");
    expect(requests[0].system).toContain("até ~120 palavras");
  });

  it("descarta PASSO e, sobrando 1, não sintetiza", async () => {
    const { deps, log } = setup((req) => {
      const w = who(req);
      if (w === "moderador") return '{"falam":["aws","oci"]}';
      return w === "oci" ? "PASSO" : "use snapshots";
    });
    const r = await sendGroup(deps, "cloud", "backup do rds");
    expect(r.sintetizou).toBe(false);
    expect(log.totalsBy("reason").sintese).toBeUndefined();
    const conv = await loadConversation(deps.storage, groupKey("cloud"));
    expect(conv.mensagens.at(-1)).toMatchObject({ agentId: "aws", content: "use snapshots" });
  });

  it("moderador sem JSON: cai em todos os membros, sem estourar o orçamento", async () => {
    const { deps, log } = setup((req) => (who(req) === "sintese" ? "ok" : who(req) === "moderador" ? "não sei" : "fala"));
    const r = await sendGroup(deps, "cloud", "pergunta geral");
    expect(r.falantes).toHaveLength(3);
    expect(log.entries().length).toBeLessThanOrEqual(5);
  });

  it("especialistas não recebem as falas uns dos outros no contexto", async () => {
    const { deps, requests } = setup((req) => {
      const w = who(req);
      if (w === "moderador") return '{"falam":["aws","oci"]}';
      if (w === "sintese") return "SINTESE";
      return `FALA_${w}`;
    });
    await sendGroup(deps, "cloud", "primeira");
    requests.length = 0;
    await sendGroup(deps, "cloud", "segunda");
    const ctx = requests.filter((r) => ["aws", "oci"].includes(who(r))).map((r) => JSON.stringify(r.messages));
    expect(ctx.every((c) => c.includes("SINTESE") && !c.includes("FALA_"))).toBe(true);
  });
});
