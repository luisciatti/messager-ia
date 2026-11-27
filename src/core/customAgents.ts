/**
 * Agentes criados pela interface. Seguem o mesmo formato e o mesmo teto de
 * tokens dos agentes do repositório (escopo + checklist + regra contra
 * invenção; sem persona decorativa).
 */
import type { Storage } from "../adapters/storage";
import { buildSystemPrompt, type AgentDef } from "./agents";
import type { GroupDef } from "./groups";
import { estimateTokens } from "./tokens";

export const MAX_TOKENS_GRUPO = 160;
export const MAX_TOKENS_DIRETO = 190;
const KEY = "agentes-custom";

export interface CustomAgentInput {
  nome: string;
  escopo: string;
  checklist: string;
  skills: string[];
  grupos: string[];
}

export type CustomAgent = AgentDef & { custom: true; grupos: string[] };

export function slug(nome: string): string {
  return (
    "c-" +
    nome
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 24)
  );
}

export function buildCustomAgent(i: CustomAgentInput): CustomAgent {
  const linhas = [
    `Escopo: ${i.escopo.trim().replace(/\.$/, "")}.`,
    i.checklist.trim() ? `Ao recomendar, considere: ${i.checklist.trim().replace(/\.$/, "")}.` : "",
    "Fora do escopo: indique o colega certo.",
    "Não invente valores, limites ou comandos; se faltar dado, peça.",
  ].filter(Boolean);
  return {
    id: slug(i.nome),
    nome: i.nome.trim(),
    papel: "especialista",
    tier: "default",
    estilo: "caveman",
    skills: i.skills.map((s) => s.trim()).filter(Boolean).slice(0, 8),
    instrucoes: linhas.join("\n"),
    custom: true,
    grupos: i.grupos,
  };
}

export function validar(a: CustomAgent, existentes: Map<string, AgentDef>) {
  const grupo = estimateTokens(buildSystemPrompt(a, "grupo"));
  const direto = estimateTokens(buildSystemPrompt(a, "direto"));
  const erros: string[] = [];
  if (a.nome.length < 2) erros.push("Dê um nome ao agente.");
  if (a.id === "c-") erros.push("Use letras ou números no nome.");
  const outro = existentes.get(a.id);
  if (outro && !(outro as Partial<CustomAgent>).custom) erros.push("Já existe um agente com esse nome.");
  if (grupo > MAX_TOKENS_GRUPO || direto > MAX_TOKENS_DIRETO) erros.push("Ficou grande demais: enxugue escopo ou checklist.");
  return { ok: erros.length === 0, erros, tokens: Math.max(grupo, direto), limite: MAX_TOKENS_DIRETO };
}

export async function loadCustomAgents(storage: Storage): Promise<CustomAgent[]> {
  return (await storage.get<{ itens: CustomAgent[] }>(KEY))?.itens ?? [];
}

export async function saveCustomAgent(storage: Storage, a: CustomAgent): Promise<CustomAgent[]> {
  const itens = [...(await loadCustomAgents(storage)).filter((x) => x.id !== a.id), a];
  await storage.set(KEY, { itens });
  return itens;
}

export async function removeCustomAgent(storage: Storage, id: string): Promise<CustomAgent[]> {
  const itens = (await loadCustomAgents(storage)).filter((x) => x.id !== id);
  await storage.set(KEY, { itens });
  return itens;
}

/** Junta os agentes do repositório com os criados e coloca estes nos grupos escolhidos. */
export function mergeCustom(
  base: Map<string, AgentDef>,
  baseGroups: Map<string, GroupDef>,
  custom: CustomAgent[],
): { agents: Map<string, AgentDef>; groups: Map<string, GroupDef> } {
  const agents = new Map(base);
  for (const a of custom) if (!base.has(a.id)) agents.set(a.id, a);
  const groups = new Map<string, GroupDef>();
  for (const [id, g] of baseGroups) {
    const extras = custom.filter((a) => a.grupos.includes(id) && agents.get(a.id) === a).map((a) => a.id);
    groups.set(id, { ...g, membros: [...g.membros, ...extras.filter((x) => !g.membros.includes(x))] });
  }
  return { agents, groups };
}
