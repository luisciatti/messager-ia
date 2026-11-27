import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// base "./" para o build funcionar quando publicado como artifact.
// Mermaid (diagramas) é carregado por import() dinâmico: o bundler o separa
// em arquivos próprios, baixados só quando aparece o primeiro diagrama.
export default defineConfig({
  base: "./",
  plugins: [react()],
  build: { chunkSizeWarningLimit: 1000 },
});
