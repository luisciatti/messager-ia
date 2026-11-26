/**
 * Conversa 1:1 com um agente.
 * Orçamento: DIRECT_BUDGET (resposta + eventual compactação).
 */

import type { Storage } from "../adapters/storage";
import { buildSystemPrompt, type AgentDef } from "./agents";
import { BudgetExceededError, BudgetTracker, DIRECT_BUDGET } from "./budget";
import {
  appendMessages,
  applyCompaction,
  buildContext,
  compactionRequest,
  emptyConversation,
  needsCompaction,
  type Conversation,
} from "./conversation";
import type { MeteredClient } from "./metered";
import { estimateTokens } from "./tokens";

export interface ChatDeps {
  metered: MeteredClient;
  storage: Storage;
  agents: Map<string, AgentDef>;
}

export const directKey = (agentId: string) => `conv-direto-${agentId}`;

export async function loadConversation(storage: Storage, key: string): Promise<Conversation> {
  return (await storage.get<Conversation>(key)) ?? emptyConversation(key);
}

export interface SendResult {
  conversa: Conversation;
  resposta: string;
  compactou: boolean;
}

export async function sendDirect(
  deps: ChatDeps,
  agentId: string,
  texto: string,
  onText?: (t: string) => void,
): Promise<SendResult> {
  const agent = deps.agents.get(agentId);
  if (!agent) throw new Error(`agente desconhecido: ${agentId}`);

  const key = directKey(agentId);
  let conv = await loadConversation(deps.storage, key);
  const budget = new BudgetTracker(DIRECT_BUDGET);

  const res = await deps.metered.ask(
    {
      system: buildSystemPrompt(agent, "direto"),
      messages: buildContext(conv, texto),
      modelTier: agent.tier,
      onText,
    },
    { agentId, reason: "resposta" },
    budget,
  );

  const now = Date.now();
  conv = appendMessages(
    conv,
    { role: "user", content: texto, at: now },
    { role: "assistant", content: res.text, at: now, agentId, tokens: estimateTokens(res.text) },
  );

  let compactou = false;
  if (needsCompaction(conv)) {
    try {
      const sum = await deps.metered.ask(compactionRequest(conv), { agentId, reason: "resumo" }, budget);
      conv = applyCompaction(conv, sum.text);
      compactou = true;
    } catch (e) {
      // sem orçamento ou falha: tenta de novo na próxima mensagem
      if (!(e instanceof BudgetExceededError)) console.warn("compactação falhou", e);
    }
  }

  await deps.storage.set(key, conv);
  return { conversa: conv, resposta: res.text, compactou };
}
