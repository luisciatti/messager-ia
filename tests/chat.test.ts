import { describe, expect, it } from "vitest";
import type { AskRequest, ClaudeClient } from "../src/adapters/claude";
import { createMemoryStorage } from "../src/adapters/storage";
import { directKey, loadConversation, sendDirect } from "../src/core/chat";
import { COMPACT_AT } from "../src/core/conversation";
import { createMeteredClient } from "../src/core/metered";
import { agents } from "../src/core/registry";
import { UsageLog } from "../src/core/tokens";

function setup() {
  const requests: AskRequest[] = [];
  const client: ClaudeClient = {
    mode: "mock",
    async ask(req) {
      requests.push(req);
      return { text: req.modelTier === "quick" ? "RESUMO" : "resposta curta", truncated: false };
    },
  };
  const log = new UsageLog();
  const storage = createMemoryStorage();
  return { requests, log, storage, deps: { metered: createMeteredClient(client, log), storage, agents } };
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

  it("compacta quando a conversa cresce, dentro do orçamento", async () => {
    const { deps, log } = setup();
    for (let i = 0; i < COMPACT_AT / 2; i++) await sendDirect(deps, "oci", `pergunta ${i}`);

    const conv = await loadConversation(deps.storage, directKey("oci"));
    expect(conv.resumo).toBe("RESUMO");
    expect(log.totalsBy("reason").resumo.calls).toBe(1);
  });

  it("rejeita agente desconhecido", async () => {
    const { deps } = setup();
    await expect(sendDirect(deps, "gcp", "oi")).rejects.toThrow(/desconhecido/);
  });
});
