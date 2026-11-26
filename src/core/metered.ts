/**
 * Cliente "medido": embrulha o ClaudeClient para que TODA chamada
 * passe pela estimativa de tokens, pelo log de uso e pelo orçamento.
 * O resto do app só deve usar este cliente, nunca o adapter direto.
 */

import { buildInput, type AskRequest, type AskResult, type ClaudeClient } from "../adapters/claude";
import type { BudgetTracker } from "./budget";
import { estimateTokens, type UsageLog, type UsageReason } from "./tokens";

export interface CallMeta {
  agentId: string;
  groupId?: string;
  reason: UsageReason;
}

export function estimateRequestTokens(req: AskRequest): number {
  return buildInput(req).reduce((sum, m) => sum + estimateTokens(m.content), 0);
}

export interface MeteredClient {
  ask(req: AskRequest, meta: CallMeta, budget?: BudgetTracker): Promise<AskResult>;
}

export function createMeteredClient(
  client: ClaudeClient,
  log: UsageLog,
  now: () => number = () => Date.now(),
): MeteredClient {
  return {
    async ask(req, meta, budget) {
      const tier = req.modelTier ?? "default";
      const inTokens = estimateRequestTokens(req);
      budget?.assertCanCall(inTokens); // lança antes de gastar

      const start = now();
      try {
        const res = await client.ask(req);
        const outTokens = estimateTokens(res.text);
        budget?.record(inTokens, outTokens);
        log.add({ ...meta, at: start, tier, inTokens, outTokens, ms: now() - start, truncated: res.truncated, failed: false });
        return res;
      } catch (err) {
        // a entrada já foi enviada: conta no orçamento e no log
        budget?.record(inTokens, 0);
        log.add({ ...meta, at: start, tier, inTokens, outTokens: 0, ms: now() - start, truncated: false, failed: true });
        throw err;
      }
    },
  };
}
