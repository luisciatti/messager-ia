/** Carrega agents/*.md e groups/*.json no build (Vite). */
import { loadAgents } from "./agents";
import { loadGroups } from "./groups";

const agentFiles = import.meta.glob(["../../agents/*.md", "!../../agents/README.md"], {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

const groupFiles = import.meta.glob("../../groups/*.json", { import: "default", eager: true }) as Record<string, unknown>;

export const agents = loadAgents(agentFiles);
export const groups = loadGroups(groupFiles, new Set(agents.keys()));
