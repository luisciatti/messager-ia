/**
 * Conversa e janela de contexto.
 *
 * O histórico completo fica guardado para exibir, mas o Claude só recebe:
 *   resumo (das mensagens antigas) + mensagens depois do ponto compactado.
 * Quando acumulam COMPACT_AT mensagens não resumidas, as mais antigas
 * (todas menos as KEEP_LAST últimas) viram resumo numa chamada "quick".
 */

import type { AskRequest, ChatMessage } from "../adapters/claude";

export const KEEP_LAST = 6;
export const COMPACT_AT = 14;
/** Limite de mensagens guardadas para exibição (tamanho do documento). */
export const MAX_STORED = 300;
export const SUMMARY_MAX_WORDS = 120;

export interface StoredMessage {
  role: "user" | "assistant";
  content: string;
  at: number;
  agentId?: string;
  /** Tokens estimados da resposta (só assistant). */
  tokens?: number;
}

export interface Conversation {
  id: string;
  resumo: string;
  mensagens: StoredMessage[];
  /** Mensagens com índice < compactadoAte já estão no resumo. */
  compactadoAte: number;
  atualizadoEm: number;
}

export function emptyConversation(id: string): Conversation {
  return { id, resumo: "", mensagens: [], compactadoAte: 0, atualizadoEm: 0 };
}

/** Junta mensagens seguidas do mesmo papel e garante que comece com "user". */
function normalize(list: ChatMessage[]): ChatMessage[] {
  const out: ChatMessage[] = [];
  for (const m of list) {
    const last = out.at(-1);
    if (last && last.role === m.role) last.content += `\n\n${m.content}`;
    else out.push({ ...m });
  }
  while (out[0]?.role === "assistant") out.shift();
  return out;
}

export function buildContext(conv: Conversation, userText: string): ChatMessage[] {
  const recent = conv.mensagens
    .slice(conv.compactadoAte)
    .map(({ role, content }) => ({ role, content }));
  const msgs = normalize([...recent, { role: "user", content: userText }]);
  if (conv.resumo) {
    msgs[0] = { ...msgs[0], content: `<resumo_anterior>\n${conv.resumo}\n</resumo_anterior>\n\n${msgs[0].content}` };
  }
  return msgs;
}

export function needsCompaction(conv: Conversation): boolean {
  return conv.mensagens.length - conv.compactadoAte >= COMPACT_AT;
}

export function compactionRequest(conv: Conversation): AskRequest {
  const end = conv.mensagens.length - KEEP_LAST;
  const trecho = conv.mensagens
    .slice(conv.compactadoAte, end)
    .map((m) => `${m.role === "user" ? "U" : "A"}: ${m.content}`)
    .join("\n");
  const anterior = conv.resumo ? `Resumo anterior:\n${conv.resumo}\n\n` : "";
  return {
    system: `Resuma a conversa em até ${SUMMARY_MAX_WORDS} palavras. Guarde fatos, decisões, números e pendências. Sem introdução.`,
    messages: [{ role: "user", content: `${anterior}Novas mensagens:\n${trecho}` }],
    modelTier: "quick",
  };
}

export function applyCompaction(conv: Conversation, resumo: string): Conversation {
  return { ...conv, resumo: resumo.trim(), compactadoAte: conv.mensagens.length - KEEP_LAST };
}

/** Acrescenta mensagens respeitando MAX_STORED (corta as mais antigas). */
export function appendMessages(conv: Conversation, ...novas: StoredMessage[]): Conversation {
  let mensagens = [...conv.mensagens, ...novas];
  let compactadoAte = conv.compactadoAte;
  const excesso = mensagens.length - MAX_STORED;
  if (excesso > 0) {
    mensagens = mensagens.slice(excesso);
    compactadoAte = Math.max(0, compactadoAte - excesso);
  }
  return { ...conv, mensagens, compactadoAte, atualizadoEm: Date.now() };
}
