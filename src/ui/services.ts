import { createClaudeClient, type ClaudeClient } from "../adapters/claude";
import { createImageStore, type ImageStore } from "../adapters/imageStore";
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
  images: ImageStore;
}

export async function createServices(): Promise<Services> {
  const [client, storage, images] = await Promise.all([createClaudeClient(), createStorage(), createImageStore()]);
  const log = new UsageLog();
  const salvos = await loadRecentUsage(storage).catch(() => []);
  log.hydrate(salvos);
  persistUsage(log, storage, salvos);
  return { client, storage, log, images, agents, groups, memory: new MemoryStore(storage), metered: createMeteredClient(client, log) };
}
