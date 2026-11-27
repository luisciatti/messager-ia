/**
 * Mensagem em grupo. Pensado para gastar o mínimo:
 * - @menção pula o moderador;
 * - moderador no tier quick, só com a pergunta (sem histórico);
 * - especialistas em paralelo, sem ver as falas uns dos outros;
 * - PASSO descarta quem não tem nada novo;
 * - 1 falante → resposta direta em linguagem normal, sem síntese.
 * Orçamento: GROUP_BUDGET (moderador + até 3 + síntese = 5).
 */

import { buildSystemPrompt, DIAGRAM_RULE, IMAGE_ONLY_TEXT, type AgentDef } from "./agents";
import { BudgetTracker, COMPACTION_BUDGET, GROUP_BUDGET, GROUP_IMAGE_BUDGET } from "./budget";
import { loadConversation, maybeCompact, systemWithMemory, type ChatDeps, type SendOptions } from "./chat";
import { appendMessages, buildContext, type Conversation, type StoredMessage } from "./conversation";
import type { GroupDef } from "./groups";
import { estimateRequestTokens } from "./metered";
import { estimateTokens } from "./tokens";

export const groupKey = (groupId: string) => `conv-grupo-${groupId}`;
export const MODERATOR_ID = "moderador";
export const SYNTH_ID = "sintetizador";

export type GroupEvent =
  | { tipo: "falantes"; ids: string[]; viaMencao: boolean }
  | { tipo: "fala"; agentId: string; texto: string; passou: boolean }
  | { tipo: "sintese"; texto: string };

export interface GroupDeps extends ChatDeps {
  groups: Map<string, GroupDef>;
}

export function parseMentions(texto: string, membros: string[]): string[] {
  const found = [...texto.matchAll(/@([\p{L}\d_-]+)/gu)].map((m) => m[1].toLowerCase());
  return membros.filter((id) => found.includes(id.toLowerCase()));
}

export function parseModerator(text: string, membros: string[], max: number): string[] {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return [];
  try {
    const j = JSON.parse(m[0]) as { falam?: unknown };
    if (!Array.isArray(j.falam)) return [];
    const ids = j.falam.map((x) => String(x).toLowerCase());
    return membros.filter((id) => ids.includes(id)).slice(0, max);
  } catch {
    return [];
  }
}

export const isPass = (t: string) => /^\s*\**passo\b/i.test(t);

function moderatorPrompt(group: GroupDef, agents: Map<string, AgentDef>, texto: string): string {
  const lista = group.membros.map((id) => `${id}: ${agents.get(id)!.skills.join(", ")}`).join("\n");
  return `Agentes:\n${lista}\n\nPergunta: ${texto}`;
}

export interface GroupResult {
  conversa: Conversation;
  falantes: string[];
  viaMencao: boolean;
  sintetizou: boolean;
}

export const DESCRIBE_SYSTEM = "Descreva a imagem em até 80 palavras: textos, números, erros e componentes visíveis. Sem opinião.";

export async function sendGroup(
  deps: GroupDeps,
  groupId: string,
  textoOriginal: string,
  onEvent?: (e: GroupEvent) => void,
  opts: SendOptions = {},
): Promise<GroupResult> {
  const group = deps.groups.get(groupId);
  if (!group) throw new Error(`grupo desconhecido: ${groupId}`);
  const budget = new BudgetTracker(opts.imagem ? GROUP_IMAGE_BUDGET : GROUP_BUDGET);
  const key = groupKey(groupId);
  let conv = await loadConversation(deps.storage, key);
  let texto = textoOriginal || (opts.imagem ? IMAGE_ONLY_TEXT : "");

  // 1) quem fala
  let falantes = parseMentions(texto, group.membros).slice(0, group.maxFalantes);
  const viaMencao = falantes.length > 0;

  // Imagem: com 1 agente chamado por @menção, vai direto para ele.
  // Senão, é descrita UMA vez (tier quick) e a descrição em texto segue para
  // moderador, agentes e síntese, em vez de pagar a imagem em cada chamada.
  const imagemDireta = opts.imagem && viaMencao && falantes.length === 1 ? opts.imagem : undefined;
  let descricao: string | undefined;
  if (opts.imagem && !imagemDireta) {
    const d = await deps.metered.ask(
      { system: DESCRIBE_SYSTEM, messages: [{ role: "user", content: texto }], modelTier: "quick", images: [opts.imagem.blob], imageTokens: opts.imagem.tokens },
      { agentId: "visao", groupId, reason: "visao" },
      budget,
    );
    descricao = d.text.trim();
    texto = `${texto}\n[imagem anexada: ${descricao}]`;
  }
  if (!viaMencao) {
    const mod = deps.agents.get(MODERATOR_ID)!;
    const res = await deps.metered.ask(
      { system: buildSystemPrompt(mod, "grupo"), messages: [{ role: "user", content: moderatorPrompt(group, deps.agents, texto) }], modelTier: mod.tier },
      { agentId: MODERATOR_ID, groupId, reason: "moderacao" },
      budget,
    );
    falantes = parseModerator(res.text, group.membros, group.maxFalantes);
    if (!falantes.length) falantes = group.membros.slice(0, group.maxFalantes);
  }
  onEvent?.({ tipo: "falantes", ids: falantes, viaMencao });

  // 2) monta as chamadas; se o orçamento não comporta todas, corta as últimas
  const sozinho = falantes.length === 1;
  const contexto = buildContext(conv, texto);
  const reqs = [];
  for (const id of falantes) {
    const agent = deps.agents.get(id)!;
    // sozinho: responde direto ao usuário em linguagem normal (sem síntese)
    const base = sozinho
      ? buildSystemPrompt(agent, "direto")
      : buildSystemPrompt(agent, "grupo");
    const { system } = await systemWithMemory(deps, base + (sozinho && opts.diagrama ? `\n${DIAGRAM_RULE}` : ""), texto);
    reqs.push({
      id,
      req: {
        system,
        messages: contexto,
        modelTier: agent.tier,
        images: imagemDireta ? [imagemDireta.blob] : undefined,
        imageTokens: imagemDireta?.tokens,
      },
    });
  }
  const reservaSintese = sozinho ? 0 : 1;
  while (reqs.length > 1) {
    const tokens = reqs.reduce((s, r) => s + estimateRequestTokens(r.req), 0);
    const cabe = budget.usedCalls + reqs.length + reservaSintese <= budget.budget.maxCalls && tokens <= budget.remainingTokens;
    if (cabe) break;
    reqs.pop();
  }

  // 3) falas em paralelo
  const falas = await Promise.all(
    reqs.map(async ({ id, req }) => {
      const r = await deps.metered.ask(req, { agentId: id, groupId, reason: "resposta" }, budget);
      const passou = !sozinho && isPass(r.text);
      onEvent?.({ tipo: "fala", agentId: id, texto: r.text, passou });
      return { id, texto: r.text.trim(), passou };
    }),
  );
  const validas = falas.filter((f) => !f.passou);

  const now = Date.now();
  const novas: StoredMessage[] = [
    {
      role: "user",
      content: textoOriginal,
      at: now,
      imagem: opts.imagem ? { url: opts.imagem.url, tokens: opts.imagem.tokens, descricao } : undefined,
    },
  ];
  let sintetizou = false;

  // 4) resposta final
  if (validas.length === 0) {
    novas.push({ role: "assistant", content: "Ninguém tinha algo novo a acrescentar.", at: now, agentId: SYNTH_ID, tokens: 0 });
  } else if (validas.length === 1) {
    const f = validas[0];
    novas.push({ role: "assistant", content: f.texto, at: now, agentId: f.id, tokens: estimateTokens(f.texto) });
  } else {
    for (const f of validas) novas.push({ role: "assistant", content: f.texto, at: now, agentId: f.id, tokens: estimateTokens(f.texto), interna: true });
    const synth = deps.agents.get(SYNTH_ID)!;
    const falasTxt = validas.map((f) => `[${deps.agents.get(f.id)!.nome}]: ${f.texto}`).join("\n\n");
    const res = await deps.metered.ask(
      {
        system: buildSystemPrompt(synth, "direto") + (opts.diagrama ? `\n${DIAGRAM_RULE}` : ""),
        messages: [{ role: "user", content: `Pergunta: ${texto}\n\nFalas:\n${falasTxt}` }],
        modelTier: synth.tier,
        onText: (t) => onEvent?.({ tipo: "sintese", texto: t }),
      },
      { agentId: SYNTH_ID, groupId, reason: "sintese" },
      budget,
    );
    novas.push({ role: "assistant", content: res.text, at: now, agentId: SYNTH_ID, tokens: estimateTokens(res.text) });
    sintetizou = true;
  }

  conv = appendMessages(conv, ...novas);
  const c = await maybeCompact(deps, conv, SYNTH_ID, new BudgetTracker(COMPACTION_BUDGET), groupId);
  await deps.storage.set(key, c.conv);
  return { conversa: c.conv, falantes: reqs.map((r) => r.id), viaMencao, sintetizou };
}
