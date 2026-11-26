import { describe, expect, it } from "vitest";
import type { AskRequest, ClaudeClient } from "../src/adapters/claude";
import { createMemoryStorage } from "../src/adapters/storage";
import { directKey, loadConversation, sendDirect, useSaved } from "../src/core/chat";
import { COMPACT_AT } from "../src/core/conversation";
import { MemoryStore } from "../src/core/memory";
import { createMeteredClient } from "../src/core/metered";
import { agents } from "../src/core/registry";
import { UsageLog } from "../src/core/tokens";

function setup() {
  const requests: AskRequest[] = [];
  const client: ClaudeClient = {
    mode: "mock",
    async ask(req) {
      requests.push(req);
      return {
        text: req.modelTier === "quick" ? '{"resumo":"RESUMO","notas":["Backup do RDS por snapshot diário"]}' : "resposta curta",
        truncated: false,
      };
    },
  };
  const log = new UsageLog();
  const storage = createMemoryStorage();
  const memory = new MemoryStore(storage);
  return { requests, log, storage, memory, deps: { metered: createMeteredClient(client, log), storage, agents, memory } };
}

describe("sendDirect", () => {
  it("responde, salva a conversa e registra o uso", async () => {
    const { deps, log, storage, requests } = setup();
    const r = await sendDirect(deps, "aws", "Como faço backup do RDS?");

    expect(r.resposta).toBe("resposta curta");
    expect(requests[0].system).toContain("AWS");
    expect(requests[0].system).not.toContain("PASSO"); // regra de grupo não vai no 1:1
    const conv = await loadConversation(storage, directKey("aws"));
    expect(conv.mensagens).toHaveLength(2);
    expect(log.entries()[0]).toMatchObject({ agentId: "aws", reason: "resposta" });
  });

  it("compacta e extrai notas na mesma chamada", async () => {
    const { deps, log, memory } = setup();
    for (let i = 0; i < COMPACT_AT / 2; i++) await sendDirect(deps, "oci", `pergunta ${i}`);

    const conv = await loadConversation(deps.storage, directKey("oci"));
    expect(conv.resumo).toBe("RESUMO");
    expect(log.totalsBy("reason").resumo.calls).toBe(1);
    expect((await memory.load()).notas.map((n) => n.texto)).toEqual(["Backup do RDS por snapshot diário"]);
  });

  it("injeta núcleo sempre e notas só quando relevantes", async () => {
    const { deps, memory, requests } = setup();
    await memory.saveNucleo(["Tasy roda na OCI"]);
    await memory.addNotas([{ texto: "Backup do RDS por snapshot diário", agentId: "aws", criadaEm: 1 }]);

    const r = await sendDirect(deps, "aws", "e o backup do rds?");
    expect(requests[0].system).toContain("Tasy roda na OCI");
    expect(requests[0].system).toContain("snapshot diário");
    expect(r.notasUsadas).toBe(1);

    await sendDirect(deps, "aws", "quanto custa o S3?");
    expect(requests[1].system).not.toContain("snapshot diário");
  });

  it("reaproveita resposta fixada sem chamar o Claude", async () => {
    const { deps, log, requests } = setup();
    const conv = await useSaved(deps, "aws", "backup do rds?", {
      id: "1", agentId: "aws", pergunta: "backup do rds", resposta: "Snapshots.", criadaEm: 1,
    });
    expect(conv.mensagens.at(-1)).toMatchObject({ content: "Snapshots.", tokens: 0, reaproveitada: true });
    expect(requests).toHaveLength(0);
    expect(log.entries()).toHaveLength(0);
  });

  it("rejeita agente desconhecido", async () => {
    const { deps } = setup();
    await expect(sendDirect(deps, "gcp", "oi")).rejects.toThrow(/desconhecido/);
  });
});
