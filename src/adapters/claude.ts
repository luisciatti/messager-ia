/**
 * Único ponto do app que fala com o Claude.
 *
 * - "artifact": roda dentro do artifact e usa claude.use("sample"),
 *   consumindo os limites da assinatura.
 * - "mock": desenvolvimento local (vite dev / testes), sem gastar nada.
 *
 * Para migrar para a API no futuro, basta criar outro adapter que
 * implemente ClaudeClient.
 */

export type ModelTier = "quick" | "default" | "complex";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface AskRequest {
  /** Instruções do agente (persona, skills, estilo). */
  system: string;
  /** Histórico já recortado/resumido. Deve terminar com role "user". */
  messages: ChatMessage[];
  modelTier?: ModelTier;
  onText?: (fullText: string) => void;
  signal?: AbortSignal;
  /** Imagens desta chamada (já reduzidas). */
  images?: Blob[];
  /** Tokens estimados das imagens, para medição e orçamento. */
  imageTokens?: number;
}

export interface AskResult {
  text: string;
  truncated: boolean;
}

export interface ClaudeClient {
  mode: "artifact" | "mock";
  ask(req: AskRequest): Promise<AskResult>;
}

/** O sample não tem campo "system": as instruções vão no início da 1ª msg. */
export function buildInput(req: AskRequest): ChatMessage[] {
  if (req.messages.length === 0 || req.messages.at(-1)!.role !== "user") {
    throw new Error("messages deve terminar com uma mensagem do usuário");
  }
  const [first, ...rest] = req.messages;
  return [
    { role: first.role, content: `<instrucoes>\n${req.system}\n</instrucoes>\n\n${first.content}` },
    ...rest,
  ];
}

type SampleFn = ((
  input: ChatMessage[],
  opts?: {
    modelTier?: ModelTier;
    signal?: AbortSignal;
    cache?: boolean;
    images?: Blob[];
    onText?: (e: { text: string; delta: string }) => void;
  },
) => Promise<AskResult>) & { limits?: () => Promise<{ images?: boolean }> };

export class ImagesUnsupportedError extends Error {
  constructor() {
    super("Este ambiente não aceita imagens no Claude.");
    this.name = "ImagesUnsupportedError";
  }
}

interface ArtifactRuntime {
  use(name: string): Promise<unknown>;
}

export function createArtifactClient(sample: SampleFn): ClaudeClient {
  return {
    mode: "artifact",
    async ask(req) {
      if (req.images?.length) {
        const lim = await sample.limits?.();
        if (!lim?.images) throw new ImagesUnsupportedError();
      }
      const res = await sample(buildInput(req), {
        modelTier: req.modelTier ?? "default",
        signal: req.signal,
        cache: false,
        images: req.images?.length ? req.images : undefined,
        onText: req.onText ? (e) => req.onText!(e.text) : undefined,
      });
      return { text: res.text, truncated: res.truncated };
    },
  };
}

/**
 * Mock que imita cada papel, para testar o fluxo inteiro localmente sem gastar:
 * moderador escolhe por palavra-chave, resumo devolve JSON, síntese junta as falas.
 */
export function mockReply(req: AskRequest): string {
  const last = req.messages.at(-1)?.content ?? "";
  if (req.system.includes('"falam"')) {
    const linhas = [...last.matchAll(/^([a-z0-9_-]+): (.*)$/gm)];
    const pergunta = (last.split("Pergunta:")[1] ?? "").toLowerCase();
    const escolhidos = linhas
      .filter(([, id, skills]) => pergunta.includes(id) || skills.split(", ").some((s) => pergunta.includes(s.split("-")[0])))
      .map(([, id]) => id);
    const falam = escolhidos.length ? escolhidos : linhas.slice(0, 2).map(([, id]) => id);
    return JSON.stringify({ falam, motivo: "simulado por palavra-chave" });
  }
  if (req.system.includes("arquiva um assunto")) {
    const forcado = req.system.includes("obrigatório");
    const resolvido = /resolv|funcionou|corrigi|ajustei/i.test(last);
    const doc = forcado || resolvido
      ? { titulo: "(simulado) Erro 502 no ALB", conteudo: "**Causa:** target group sem instâncias saudáveis.\n- Ajustar health check para `/health`\n- Conferir security group do destino", tags: ["alb", "502"] }
      : null;
    return JSON.stringify({ notas: ["(simulado) ALB usa health check em /health"], doc });
  }
  if (req.system.includes("Descreva a imagem")) {
    return "(simulado) Print de tela com um painel e uma mensagem de erro.";
  }
  if (req.system.includes("Resuma a conversa")) {
    return JSON.stringify({ resumo: "(simulado) resumo da conversa.", notas: [] });
  }
  if (req.system.includes("Una as falas")) {
    const nomes = [...last.matchAll(/^\[([^\]]+)\]:/gm)].map((m) => m[1]);
    return `(simulado) Síntese das falas de ${nomes.join(", ")}. No artifact, o Claude une as posições de verdade.`;
  }
  const pergunta = last.split("\n\n").at(-1) ?? last;
  const img = req.images?.length ? ` Recebi ${req.images.length} imagem(ns).` : "";
  const diagrama = req.system.includes("mermaid") ? "\n\n```mermaid\ngraph LR\n  Usuario --> LB[Load Balancer]\n  LB --> A[App 1]\n  LB --> B[App 2]\n```" : "";
  return `(simulado) Resposta de teste para: "${pergunta.slice(0, 120)}".${img} No artifact, o Claude responde de verdade.${diagrama}`;
}

export function createMockClient(delayMs = typeof window === "undefined" ? 0 : 500): ClaudeClient {
  return {
    mode: "mock",
    async ask(req) {
      const text = mockReply(req);
      if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
      req.onText?.(text);
      return { text, truncated: false };
    },
  };
}

/** Usa o runtime do artifact se existir; senão cai no mock. */
export async function createClaudeClient(
  runtime: ArtifactRuntime | undefined = (globalThis as { claude?: ArtifactRuntime }).claude,
): Promise<ClaudeClient> {
  if (runtime?.use) {
    const sample = (await runtime.use("sample")) as SampleFn | null;
    if (sample) return createArtifactClient(sample);
  }
  return createMockClient();
}
