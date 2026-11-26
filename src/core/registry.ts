/** Carrega agents/*.md no build (Vite). */
import { loadAgents } from "./agents";

const files = import.meta.glob(["../../agents/*.md", "!../../agents/README.md"], {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

export const agents = loadAgents(files);
