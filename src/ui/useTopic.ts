import { useState } from "react";
import { closeTopic } from "../core/closing";
import type { Conversation } from "../core/conversation";
import type { Services } from "./services";

/** /clear e /doc de uma conversa, com a mensagem de resultado para o usuário. */
export function useTopic(services: Services, key: string, agentId: string, onConv: (c: Conversation) => void, groupId?: string) {
  const [ocupado, setOcupado] = useState(false);

  async function executar(modo: "clear" | "doc"): Promise<string> {
    setOcupado(true);
    try {
      const r = await closeTopic(services, key, agentId, modo, groupId);
      onConv(r.conversa);
      const partes: string[] = [];
      if (r.notas) partes.push(`${r.notas} nota(s)`);
      if (r.doc) partes.push(`doc "${r.doc.titulo}"`);
      if (modo === "doc") return r.doc ? `Doc criado: "${r.doc.titulo}".` : "Não havia conteúdo para um doc.";
      if (!r.chamou) return "Conversa limpa (nada para arquivar, 0 tokens).";
      return partes.length ? `Conversa limpa. Guardado na memória: ${partes.join(" e ")}.` : "Conversa limpa. Nada durável para guardar.";
    } catch {
      return "Não consegui arquivar agora. A conversa não foi limpa.";
    } finally {
      setOcupado(false);
    }
  }

  return { ocupado, executar };
}
