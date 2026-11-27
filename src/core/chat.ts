/**
 * Conversa 1:1 com um agente.
 * Orçamento: DIRECT_BUDGET (resposta + eventual compactação).
 */

import type { Storage } from "../adapters/storage";
import { buildSystemPrompt, DIAGRAM_RULE, IMAGE_ONLY_TEXT, type AgentDef } from "./agents";
import { BudgetExceededError, BudgetTracker, DIRECT_BUDGET } from "./budget";
import {
  appendMessages,
  applyCompaction,
  buildContext,
  compactionRequest,
  emptyConversation,
  needsCompaction,
  parseCompaction,
  type Conversation,
} from "./conversation";
import type { ImagemEnvio } from "./images";
import { memoryBlock, searchDocs, searchNotes, type Fixada, type MemoryStore } from "./memory";
import type { MeteredClient } from "./metered";
import { estimateTokens } from "./tokens";

export interface ChatDeps {
  metered: MeteredClient;
  storage: Storage;
  agents: Map<string, AgentDef>;
  memory: MemoryStore;
}

export const directKey = (agentId: string) => `conv-direto-${agentId}`;

export async function loadConversation(storage: Storage, key: string): Promise<Conversation> {
  return (await storage.get<Conversation>(key)) ?? emptyConversation(key);
}

/** System prompt + memória relevante (núcleo sempre; notas só se a busca local achar). */
export async function systemWithMemory(deps: ChatDeps, base: string, query: string) {
  const mem = await deps.memory.load();
  const notas = searchNotes(mem.notas, query);
  const docs = searchDocs(mem.docs, query);
  const bloco = memoryBlock(mem.nucleo, notas, docs);
  return { system: bloco ? `${base}\n${bloco}` : base, notasUsadas: notas.length, docsUsados: docs.map((d) => d.titulo) };
}

/** Compacta se precisar; extrai notas na mesma chamada. Falha não derruba a conversa. */
export async function maybeCompact(
  deps: ChatDeps,
  conv: Conversation,
  agentId: string,
  budget: BudgetTracker,
  groupId?: string,
): Promise<{ conv: Conversation; compactou: boolean }> {
  if (!needsCompaction(conv)) return { conv, compactou: false };
  try {
    const res = await deps.metered.ask(compactionRequest(conv), { agentId, groupId, reason: "resumo" }, budget);
    const { resumo, notas } = parseCompaction(res.text);
    const at = Date.now();
    await deps.memory.addNotas(notas.map((texto) => ({ texto, agentId, criadaEm: at })));
    return { conv: applyCompaction(conv, resumo), compactou: true };
  } catch (e) {
    // sem orçamento ou falha: tenta de novo na próxima mensagem
    if (!(e instanceof BudgetExceededError)) console.warn("compactação falhou", e);
    return { conv, compactou: false };
  }
}

export interface SendResult {
  conversa: Conversation;
  resposta: string;
  compactou: boolean;
  notasUsadas: number;
  docsUsados: string[];
}

export interface SendOptions {
  imagem?: ImagemEnvio;
  /** Pede um diagrama Mermaid na resposta (só quando o usuário liga). */
  diagrama?: boolean;
}

export async function sendDirect(
  deps: ChatDeps,
  agentId: string,
  texto: string,
  onText?: (t: string) => void,
  opts: SendOptions = {},
): Promise<SendResult> {
  const agent = deps.agents.get(agentId);
  if (!agent) throw new Error(`agente desconhecido: ${agentId}`);

  const key = directKey(agentId);
  let conv = await loadConversation(deps.storage, key);
  const budget = new BudgetTracker(DIRECT_BUDGET);
  const base = buildSystemPrompt(agent, "direto") + (opts.diagrama ? `\n${DIAGRAM_RULE}` : "");
  const { system, notasUsadas, docsUsados } = await systemWithMemory(deps, base, texto);
  const pergunta = texto || (opts.imagem ? IMAGE_ONLY_TEXT : "");

  const res = await deps.metered.ask(
    {
      system,
      messages: buildContext(conv, pergunta),
      modelTier: agent.tier,
      onText,
      images: opts.imagem ? [opts.imagem.blob] : undefined,
      imageTokens: opts.imagem?.tokens,
    },
    { agentId, reason: "resposta" },
    budget,
  );

  const now = Date.now();
  conv = appendMessages(
    conv,
    {
      role: "user",
      content: texto,
      at: now,
      imagem: opts.imagem ? { url: opts.imagem.url, tokens: opts.imagem.tokens } : undefined,
    },
    { role: "assistant", content: res.text, at: now, agentId, tokens: estimateTokens(res.text) },
  );

  const c = await maybeCompact(deps, conv, agentId, budget);
  await deps.storage.set(key, c.conv);
  return { conversa: c.conv, resposta: res.text, compactou: c.compactou, notasUsadas, docsUsados };
}

/** Reaproveita uma resposta fixada: nenhuma chamada ao Claude. */
export async function useSaved(deps: ChatDeps, agentId: string, texto: string, fixada: Fixada): Promise<Conversation> {
  const key = directKey(agentId);
  const now = Date.now();
  const conv = appendMessages(
    await loadConversation(deps.storage, key),
    { role: "user", content: texto, at: now },
    { role: "assistant", content: fixada.resposta, at: now, agentId, tokens: 0, reaproveitada: true },
  );
  await deps.storage.set(key, conv);
  return conv;
}
