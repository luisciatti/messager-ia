import { createClaudeClient, type ClaudeClient } from "../adapters/claude";
import { createStorage, type Storage } from "../adapters/storage";
import { MemoryStore } from "../core/memory";
import { createMeteredClient, type MeteredClient } from "../core/metered";
import { agents, groups } from "../core/registry";
import { UsageLog } from "../core/tokens";
import { loadRecentUsage, persistUsage } from "../core/usageStore";
import type { GroupDeps } from "../core/group";

export interface Services extends GroupDeps {
  client: ClaudeClient;
  storage: Storage;
  metered: MeteredClient;
  log: UsageLog;
}

export async function createServices(): Promise<Services> {
  const [client, storage] = await Promise.all([createClaudeClient(), createStorage()]);
  const log = new UsageLog();
  const salvos = await loadRecentUsage(storage).catch(() => []);
  log.hydrate(salvos);
  persistUsage(log, storage, salvos);
  return { client, storage, log, agents, groups, memory: new MemoryStore(storage), metered: createMeteredClient(client, log) };
}
