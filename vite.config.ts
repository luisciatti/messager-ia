import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// base "./" para o build funcionar quando publicado como artifact
export default defineConfig({
  base: "./",
  plugins: [react()],
});
