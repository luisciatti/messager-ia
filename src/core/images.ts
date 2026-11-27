/**
 * Custo de imagem em tokens (docs da Anthropic): cada bloco de 28×28 px é um
 * "visual token": ceil(w/28) × ceil(h/28). Acima de 1568 px no lado maior
 * ou 1568 tokens o próprio Claude reduz a imagem.
 *
 * Reduzimos ANTES de enviar até caber em IMAGE_MAX_TOKENS: menos custo e
 * menos latência, ainda legível para prints de tela.
 */

export const IMAGE_MAX_TOKENS = 1000;
export const IMAGE_MAX_EDGE = 1568;

export function visualTokens(width: number, height: number): number {
  return Math.ceil(width / 28) * Math.ceil(height / 28);
}

export function fitImage(
  width: number,
  height: number,
  maxTokens = IMAGE_MAX_TOKENS,
  maxEdge = IMAGE_MAX_EDGE,
): { width: number; height: number; tokens: number } {
  let scale = Math.min(1, maxEdge / Math.max(width, height));
  let w = Math.max(1, Math.round(width * scale));
  let h = Math.max(1, Math.round(height * scale));
  while (visualTokens(w, h) > maxTokens && w > 28 && h > 28) {
    scale *= 0.95;
    w = Math.max(1, Math.round(width * scale));
    h = Math.max(1, Math.round(height * scale));
  }
  return { width: w, height: h, tokens: visualTokens(w, h) };
}

/** Imagem pronta para enviar (já reduzida). */
export interface ImagemEnvio {
  blob: Blob;
  tokens: number;
  /** URL persistente (asset do artifact) ou miniatura data: no modo local. */
  url?: string;
}

/** O que fica guardado na mensagem: a imagem nunca é reenviada no histórico. */
export interface ImagemSalva {
  url?: string;
  tokens: number;
  descricao?: string;
}
