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

type SampleFn = (
  input: ChatMessage[],
  opts?: {
    modelTier?: ModelTier;
    signal?: AbortSignal;
    cache?: boolean;
    onText?: (e: { text: string; delta: string }) => void;
  },
) => Promise<AskResult>;

interface ArtifactRuntime {
  use(name: string): Promise<unknown>;
}

export function createArtifactClient(sample: SampleFn): ClaudeClient {
  return {
    mode: "artifact",
    async ask(req) {
      const res = await sample(buildInput(req), {
        modelTier: req.modelTier ?? "default",
        signal: req.signal,
        cache: false,
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
  if (req.system.includes("Resuma a conversa")) {
    return JSON.stringify({ resumo: "(simulado) resumo da conversa.", notas: [] });
  }
  if (req.system.includes("Una as falas")) {
    const nomes = [...last.matchAll(/^\[([^\]]+)\]:/gm)].map((m) => m[1]);
    return `(simulado) Síntese das falas de ${nomes.join(", ")}. No artifact, o Claude une as posições de verdade.`;
  }
  const pergunta = last.split("\n\n").at(-1) ?? last;
  return `(simulado) Resposta de teste para: "${pergunta.slice(0, 120)}". No artifact, o Claude responde de verdade.`;
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
