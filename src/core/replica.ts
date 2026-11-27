/**
 * Réplica sob demanda no grupo (debate multiagente, 2ª rodada).
 *
 * Cada membro vê SÓ a pergunta e a resposta final (debate esparso: nada de
 * histórico, nada das falas dos colegas). Quem concorda responde PASSO.
 * Se todos concordarem, nada é gravado e não há síntese nova.
 * Se houver objeção, o sintetizador revisa a resposta considerando-as.
 */
import { buildSystemPrompt } from "./agents";
import { BudgetTracker, GROUP_BUDGET } from "./budget";
import { loadConversation, systemWithMemory } from "./chat";
import { appendMessages, type Conversation, type StoredMessage } from "./conversation";
import { groupKey, isPass, SYNTH_ID, type GroupDeps } from "./group";
import { estimateTokens } from "./tokens";

export const REPLICA_RULE =
  "Revise a resposta final abaixo na sua área. Correta e completa: responda só PASSO. Senão, aponte em até 3 linhas o erro ou o que falta.";
export const REVISAO_RULE = "Revise a resposta anterior considerando as objeções. Mantenha o que está certo e corrija o resto.";

export interface ReplicaResult {
  conversa: Conversation;
  objecoes: { agentId: string; texto: string }[];
  revisou: boolean;
}

/** Última pergunta do usuário e a resposta final (não interna) que veio depois dela. */
export function ultimaTroca(conv: Conversation): { pergunta: StoredMessage; final: StoredMessage } | null {
  for (let i = conv.mensagens.length - 1; i >= 0; i--) {
    const m = conv.mensagens[i];
    if (m.role === "assistant" && !m.interna) {
      for (let j = i - 1; j >= 0; j--) if (conv.mensagens[j].role === "user") return { pergunta: conv.mensagens[j], final: m };
      return null;
    }
    if (m.role === "user") return null; // última mensagem sem resposta
  }
  return null;
}

export async function requestReplica(deps: GroupDeps, groupId: string): Promise<ReplicaResult> {
  const group = deps.groups.get(groupId);
  if (!group) throw new Error(`grupo desconhecido: ${groupId}`);
  const key = groupKey(groupId);
  let conv = await loadConversation(deps.storage, key);
  const troca = ultimaTroca(conv);
  if (!troca) throw new Error("nada para revisar");

  const budget = new BudgetTracker(GROUP_BUDGET);
  const pergunta = troca.pergunta.content || "[imagem]";
  const contexto = `Pergunta: ${pergunta}\n\nResposta final:\n${troca.final.content}`;
  const membros = group.membros.slice(0, group.maxFalantes);

  const falas = await Promise.all(
    membros.map(async (id) => {
      const agent = deps.agents.get(id)!;
      const { system } = await systemWithMemory(deps, `${buildSystemPrompt(agent, "grupo")}\n${REPLICA_RULE}`, pergunta);
      const r = await deps.metered.ask(
        { system, messages: [{ role: "user", content: contexto }], modelTier: agent.tier },
        { agentId: id, groupId, reason: "resposta" },
        budget,
      );
      return { agentId: id, texto: r.text.trim() };
    }),
  );
  const objecoes = falas.filter((f) => !isPass(f.texto));
  if (!objecoes.length) return { conversa: conv, objecoes, revisou: false };

  const synth = deps.agents.get(SYNTH_ID)!;
  const lista = objecoes.map((o) => `[${deps.agents.get(o.agentId)!.nome}]: ${o.texto}`).join("\n");
  const res = await deps.metered.ask(
    {
      system: `${buildSystemPrompt(synth, "direto")}\n${REVISAO_RULE}`,
      messages: [{ role: "user", content: `${contexto}\n\nObjeções:\n${lista}` }],
      modelTier: synth.tier,
    },
    { agentId: SYNTH_ID, groupId, reason: "sintese" },
    budget,
  );

  const now = Date.now();
  conv = appendMessages(
    conv,
    ...objecoes.map((o) => ({ role: "assistant" as const, content: o.texto, at: now, agentId: o.agentId, tokens: estimateTokens(o.texto), interna: true })),
    { role: "assistant", content: res.text, at: now, agentId: SYNTH_ID, tokens: estimateTokens(res.text), tier: synth.tier, replica: true },
  );
  await deps.storage.set(key, conv);
  return { conversa: conv, objecoes, revisou: true };
}
