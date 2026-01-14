import type { KnowledgeGraphStore, StorageBackendFactory } from "./types";

const registry = new Map<string, StorageBackendFactory>();

export function registerStorageBackend(
  kind: string,
  factory: StorageBackendFactory
) {
  registry.set(kind.toLowerCase(), factory);
}

export function getRegisteredBackends(): string[] {
  return [...registry.keys()].sort();
}

export async function createStoreFromEnv(args: {
  baseDir: string;
}): Promise<{ kind: string; store: KnowledgeGraphStore }> {
  const kind = (
    process.env.MEMORY_STORAGE_BACKEND ??
    process.env.MEMORY_BACKEND ??
    "jsonl"
  ).toLowerCase();

  const factory = registry.get(kind);
  if (!factory) {
    throw new Error(
      `Unknown storage backend: ${kind}. Registered backends: ${getRegisteredBackends().join(
        ", "
      )}`
    );
  }

  const store = await factory({ baseDir: args.baseDir });
  return { kind, store };
}
