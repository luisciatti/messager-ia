import { createClaudeClient, type ClaudeClient } from "../adapters/claude";
import { createImageStore, type ImageStore } from "../adapters/imageStore";
import { createStorage, type Storage } from "../adapters/storage";
import { MemoryStore } from "../core/memory";
import { createMeteredClient, type MeteredClient } from "../core/metered";
import { agents, groups } from "../core/registry";
import { UsageLog } from "../core/tokens";
import { loadRecentUsage, persistUsage } from "../core/usageStore";
import { inicioDoDia, loadConfig, statusMeta, type Config } from "../core/settings";
import { loadCustomAgents, mergeCustom } from "../core/customAgents";
import type { GroupDeps } from "../core/group";

export interface Services extends GroupDeps {
  client: ClaudeClient;
  storage: Storage;
  metered: MeteredClient;
  log: UsageLog;
  images: ImageStore;
  /** Mutável: atualizado ao salvar na aba de tokens. */
  config: Config;
}

export async function createServices(): Promise<Services> {
  const [client, storage, images] = await Promise.all([createClaudeClient(), createStorage(), createImageStore()]);
  const log = new UsageLog();
  const salvos = await loadRecentUsage(storage).catch(() => []);
  log.hydrate(salvos);
  persistUsage(log, storage, salvos);
  const custom = await loadCustomAgents(storage).catch(() => []);
  const mesclado = mergeCustom(agents, groups, custom);
  const config = await loadConfig(storage).catch(() => ({ metaDiaria: 20000, pausarNaMeta: false }));
  return { client, storage, log, images, config, agents: mesclado.agents, groups: mesclado.groups, memory: new MemoryStore(storage), metered: createMeteredClient(client, log) };
}

/** Uso de hoje contra a meta diária (0 tokens: só soma o log local). */
export function metaHoje(services: Services) {
  const ini = inicioDoDia();
  const usado = services.log.totals((e) => e.at >= ini).total;
  return { usado, meta: services.config.metaDiaria, ...statusMeta(usado, services.config.metaDiaria) };
}

/** Mensagem de bloqueio, se a pausa na meta estiver ligada e a meta estourada. */
export function bloqueioMeta(services: Services): string | null {
  const m = metaHoje(services);
  return services.config.pausarNaMeta && m.nivel === "estourado"
    ? `Meta diária atingida (~${m.usado.toLocaleString("pt-BR")} de ${m.meta.toLocaleString("pt-BR")} tokens). Ajuste em Uso de tokens.`
    : null;
}

/** Recarrega os agentes criados pela interface (muta os mapas compartilhados). */
export async function recarregarAgentes(services: Services): Promise<void> {
  const custom = await loadCustomAgents(services.storage);
  const r = mergeCustom(agents, groups, custom);
  services.agents.clear();
  for (const [k, v] of r.agents) services.agents.set(k, v);
  services.groups.clear();
  for (const [k, v] of r.groups) services.groups.set(k, v);
}
