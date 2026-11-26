import { useEffect, useState } from "react";
import { createClaudeClient, type ClaudeClient } from "../adapters/claude";

export function App() {
  const [client, setClient] = useState<ClaudeClient | null>(null);

  useEffect(() => {
    createClaudeClient().then(setClient);
  }, []);

  return (
    <main style={{ fontFamily: "system-ui, sans-serif", padding: 24 }}>
      <h1>Messager de IA</h1>
      <p>
        Modo do Claude:{" "}
        <strong>{client ? client.mode : "carregando..."}</strong>
      </p>
    </main>
  );
}
