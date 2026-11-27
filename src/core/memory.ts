/**
 * Memória em 3 camadas (inspirada em MemGPT/Letta e Mem0):
 *
 * 1. Núcleo: fatos fixos do ambiente. Sempre no prompt, com teto de tokens.
 * 2. Notas: conclusões extraídas das conversas. Fora do prompt; entram só
 *    as relevantes, achadas por busca LOCAL (0 tokens).
 * 3. Fixadas: perguntas e respostas que o usuário marcou. Nunca vão ao
 *    prompt; são oferecidas para reaproveitar (0 tokens) com o ok dele.
 */

import type { Storage } from "../adapters/storage";
import { estimateTokens } from "./tokens";

export const NUCLEO_MAX_TOKENS = 100;
export const NOTAS_MAX_TOKENS = 150;
export const NOTAS_MAX = 200;
export const FIXADAS_MAX = 100;
export const SIMILAR_NOTA = 0.8;
export const SIMILAR_FIXADA = 0.6;

export interface Nota {
  id: string;
  texto: string;
  agentId: string;
  criadaEm: number;
}

export interface Fixada {
  id: string;
  agentId: string;
  pergunta: string;
  resposta: string;
  criadaEm: number;
}

/** Doc: síntese curta de um assunto RESOLVIDO (problema → solução → cuidados). */
export interface Doc {
  id: string;
  titulo: string;
  conteudo: string;
  tags: string[];
  agentId: string;
  criadaEm: number;
  atualizadoEm: number;
}

export interface Memoria {
  nucleo: string[];
  notas: Nota[];
  fixadas: Fixada[];
  docs: Doc[];
}

export const DOCS_MAX = 100;
export const DOCS_MAX_TOKENS = 250;
export const SIMILAR_DOC = 0.6;

const STOP = new Set(
  "a o e de da do das dos em no na nos nas um uma para por com sem que se os as ao aos como mais mas ou eu voce meu minha isso esse essa este esta ser ter tem sao foi qual quais quando onde porque pra pro fazer faco faz posso pode devo deve preciso quero consigo the and of to in is".split(" "),
);

export function terms(text: string): Set<string> {
  const norm = text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
  return new Set(norm.split(/[^a-z0-9]+/).filter((t) => t.length >= 2 && !STOP.has(t)));
}

export function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  return inter / (a.size + b.size - inter);
}

/** Busca local tipo BM25 simplificado: termos raros pesam mais. */
export function searchNotes(notas: Nota[], query: string, maxTokens = NOTAS_MAX_TOKENS, max = 3): Nota[] {
  const q = terms(query);
  if (!q.size || !notas.length) return [];
  const sets = notas.map((n) => terms(n.texto));
  const df = new Map<string, number>();
  for (const s of sets) for (const t of s) if (q.has(t)) df.set(t, (df.get(t) ?? 0) + 1);

  const scored = notas
    .map((n, i) => {
      let score = 0;
      for (const t of q) if (sets[i].has(t)) score += Math.log(1 + notas.length / df.get(t)!);
      return { n, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || b.n.criadaEm - a.n.criadaEm);

  const out: Nota[] = [];
  let used = 0;
  for (const { n } of scored) {
    const t = estimateTokens(n.texto);
    if (out.length >= max) break;
    if (used + t > maxTokens) continue; // grande demais: tenta a próxima
    out.push(n);
    used += t;
  }
  return out;
}

/** Mesma busca local das notas, sobre título + tags + conteúdo. Por padrão só o melhor doc. */
export function searchDocs(docs: Doc[], query: string, maxTokens = DOCS_MAX_TOKENS, max = 1): Doc[] {
  const comoNotas = docs.map((d) => ({ id: d.id, agentId: d.agentId, criadaEm: d.atualizadoEm, texto: `${d.titulo} ${d.tags.join(" ")} ${d.conteudo}` }));
  const achados = searchNotes(comoNotas, query, Number.MAX_SAFE_INTEGER, docs.length);
  const out: Doc[] = [];
  let used = 0;
  for (const a of achados) {
    const d = docs.find((x) => x.id === a.id)!;
    const t = estimateTokens(`${d.titulo}\n${d.conteudo}`);
    if (out.length >= max) break;
    if (used + t > maxTokens) continue;
    out.push(d);
    used += t;
  }
  return out;
}

export function findFixada(fixadas: Fixada[], agentId: string, pergunta: string): Fixada | null {
  const q = terms(pergunta);
  let best: { f: Fixada; s: number } | null = null;
  for (const f of fixadas) {
    if (f.agentId !== agentId) continue;
    const s = jaccard(q, terms(f.pergunta));
    if (s >= SIMILAR_FIXADA && (!best || s > best.s)) best = { f, s };
  }
  return best?.f ?? null;
}

export function nucleoTokens(nucleo: string[]): number {
  return estimateTokens(nucleo.join("\n"));
}

const fmtData = (ms: number) => new Date(ms).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });

/** Bloco que vai no system prompt. Vazio se não houver nada. */
export function memoryBlock(nucleo: string[], notas: Nota[], docs: Doc[] = []): string {
  const parts: string[] = [];
  if (nucleo.length) parts.push(`Ambiente do usuário:\n${nucleo.map((f) => `- ${f}`).join("\n")}`);
  if (notas.length) parts.push(`Notas de conversas anteriores (podem estar desatualizadas):\n${notas.map((n) => `- (${fmtData(n.criadaEm)}) ${n.texto}`).join("\n")}`);
  if (docs.length) {
    parts.push(`Doc da base do usuário (cite pelo título se usar):\n${docs.map((d) => `[${d.titulo}]\n${d.conteudo}`).join("\n\n")}`);
  }
  return parts.length ? `<memoria>\n${parts.join("\n")}\n</memoria>` : "";
}

/** Acrescenta notas evitando duplicatas (substitui a parecida) e limitando o total. */
export function mergeNotas(atuais: Nota[], novas: Omit<Nota, "id">[]): Nota[] {
  let list = [...atuais];
  for (const n of novas) {
    const texto = n.texto.trim();
    if (!texto) continue;
    const t = terms(texto);
    list = list.filter((x) => jaccard(t, terms(x.texto)) < SIMILAR_NOTA);
    list.push({ ...n, texto, id: `${n.criadaEm}-${Math.random().toString(36).slice(2, 8)}` });
  }
  return list.sort((a, b) => a.criadaEm - b.criadaEm).slice(-NOTAS_MAX);
}

/** Acrescenta ou atualiza (título parecido = mesmo assunto) e limita o total. */
export function mergeDoc(atuais: Doc[], novo: Omit<Doc, "id" | "atualizadoEm">): { docs: Doc[]; doc: Doc } {
  const t = terms(novo.titulo);
  const igual = atuais.find((d) => jaccard(t, terms(d.titulo)) >= SIMILAR_DOC);
  const doc: Doc = igual
    ? { ...igual, ...novo, id: igual.id, criadaEm: igual.criadaEm, atualizadoEm: novo.criadaEm }
    : { ...novo, id: `${novo.criadaEm}-${Math.random().toString(36).slice(2, 8)}`, atualizadoEm: novo.criadaEm };
  const docs = [...atuais.filter((d) => d.id !== doc.id), doc].sort((a, b) => a.atualizadoEm - b.atualizadoEm).slice(-DOCS_MAX);
  return { docs, doc };
}

const KEYS = { nucleo: "memoria-nucleo", notas: "memoria-notas", fixadas: "memoria-fixadas", docs: "memoria-docs" } as const;

export class MemoryStore {
  constructor(private storage: Storage) {}

  async load(): Promise<Memoria> {
    const [n, no, f, d] = await Promise.all([
      this.storage.get<{ fatos: string[] }>(KEYS.nucleo),
      this.storage.get<{ itens: Nota[] }>(KEYS.notas),
      this.storage.get<{ itens: Fixada[] }>(KEYS.fixadas),
      this.storage.get<{ itens: Doc[] }>(KEYS.docs),
    ]);
    return { nucleo: n?.fatos ?? [], notas: no?.itens ?? [], fixadas: f?.itens ?? [], docs: d?.itens ?? [] };
  }

  async saveNucleo(fatos: string[]): Promise<void> {
    const limpos = fatos.map((f) => f.trim()).filter(Boolean);
    if (nucleoTokens(limpos) > NUCLEO_MAX_TOKENS) {
      throw new Error(`Núcleo passa de ~${NUCLEO_MAX_TOKENS} tokens. Enxugue os fatos.`);
    }
    await this.storage.set(KEYS.nucleo, { fatos: limpos });
  }

  async addNotas(novas: Omit<Nota, "id">[]): Promise<Nota[]> {
    if (!novas.length) return (await this.load()).notas;
    const { notas } = await this.load();
    const itens = mergeNotas(notas, novas);
    await this.storage.set(KEYS.notas, { itens });
    return itens;
  }

  async removeNota(id: string): Promise<void> {
    const { notas } = await this.load();
    await this.storage.set(KEYS.notas, { itens: notas.filter((n) => n.id !== id) });
  }

  async addDoc(novo: Omit<Doc, "id" | "atualizadoEm">): Promise<Doc> {
    const { docs } = await this.load();
    const r = mergeDoc(docs, novo);
    await this.storage.set(KEYS.docs, { itens: r.docs });
    return r.doc;
  }

  async removeDoc(id: string): Promise<void> {
    const { docs } = await this.load();
    await this.storage.set(KEYS.docs, { itens: docs.filter((d) => d.id !== id) });
  }

  async fixar(f: Omit<Fixada, "id">): Promise<void> {
    const { fixadas } = await this.load();
    const itens = [...fixadas, { ...f, id: `${f.criadaEm}` }].slice(-FIXADAS_MAX);
    await this.storage.set(KEYS.fixadas, { itens });
  }

  async removeFixada(id: string): Promise<void> {
    const { fixadas } = await this.load();
    await this.storage.set(KEYS.fixadas, { itens: fixadas.filter((f) => f.id !== id) });
  }
}
