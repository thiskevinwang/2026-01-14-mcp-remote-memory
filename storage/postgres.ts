import { SQL } from "bun";

import type { Entity, KnowledgeGraph, Relation } from "../graph";
import { openGraph, searchGraph } from "../graph";
import type {
  KnowledgeGraphStore,
  ObservationAdd,
  ObservationAddResult,
  ObservationDeletion,
} from "./types";

export class PostgresKnowledgeGraphStore implements KnowledgeGraphStore {
  private sql: any;

  constructor(private connectionString: string) {
    this.sql = new SQL(this.connectionString);
  }

  async close(): Promise<void> {
    const s = this.sql as any;
    if (typeof s.close === "function") await s.close();
    if (typeof s.end === "function") await s.end();
  }

  private async inTransaction<T>(fn: (tx: any) => Promise<T>): Promise<T> {
    const s = this.sql as any;
    if (typeof s.begin === "function") {
      return await s.begin(async (tx: any) => fn(tx));
    }

    // Fallback (best-effort): run BEGIN/COMMIT on the default connection.
    await this.sql`BEGIN`;
    try {
      const result = await fn(this.sql);
      await this.sql`COMMIT`;
      return result;
    } catch (err) {
      await this.sql`ROLLBACK`;
      throw err;
    }
  }

  async migrate(): Promise<void> {
    // 0) Ensure migrations table exists
    await this.sql`
      CREATE TABLE IF NOT EXISTS mcp_memory_migrations (
        version integer PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `;

    const appliedRows = (await this.sql`
      SELECT version FROM mcp_memory_migrations ORDER BY version
    `) as Array<{ version: number }>;

    const applied = new Set(appliedRows.map((r) => r.version));

    // 1) Initial schema
    if (!applied.has(1)) {
      await this.inTransaction(async (tx) => {
        await tx`
          CREATE TABLE IF NOT EXISTS mcp_entities (
            name text PRIMARY KEY,
            entity_type text NOT NULL
          )
        `;

        await tx`
          CREATE TABLE IF NOT EXISTS mcp_observations (
            entity_name text NOT NULL REFERENCES mcp_entities(name) ON DELETE CASCADE,
            content text NOT NULL,
            PRIMARY KEY (entity_name, content)
          )
        `;

        // Note: no foreign keys here to preserve the original JSONL behavior
        // where relations can exist even if entities are missing.
        await tx`
          CREATE TABLE IF NOT EXISTS mcp_relations (
            from_name text NOT NULL,
            to_name text NOT NULL,
            relation_type text NOT NULL,
            PRIMARY KEY (from_name, to_name, relation_type)
          )
        `;

        await tx`
          INSERT INTO mcp_memory_migrations (version) VALUES (1)
          ON CONFLICT (version) DO NOTHING
        `;
      });
    }
  }

  private normalizeObservations(value: unknown): string[] {
    if (Array.isArray(value)) return value.filter((v) => typeof v === "string");
    if (typeof value === "string") {
      try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed)
          ? parsed.filter((v) => typeof v === "string")
          : [];
      } catch {
        return [];
      }
    }
    return [];
  }

  async readGraph(): Promise<KnowledgeGraph> {
    const entityRows = (await this.sql`
      SELECT
        e.name as name,
        e.entity_type as "entityType",
        COALESCE(
          json_agg(o.content ORDER BY o.content) FILTER (WHERE o.content IS NOT NULL),
          '[]'::json
        ) as observations
      FROM mcp_entities e
      LEFT JOIN mcp_observations o ON o.entity_name = e.name
      GROUP BY e.name, e.entity_type
      ORDER BY e.name
    `) as Array<{ name: string; entityType: string; observations: unknown }>;

    const relationRows = (await this.sql`
      SELECT
        from_name as "from",
        to_name as "to",
        relation_type as "relationType"
      FROM mcp_relations
    `) as Array<{ from: string; to: string; relationType: string }>;

    const entities: Entity[] = entityRows.map((r) => ({
      name: r.name,
      entityType: r.entityType,
      observations: this.normalizeObservations(r.observations),
    }));

    const relations: Relation[] = relationRows.map((r) => ({
      from: r.from,
      to: r.to,
      relationType: r.relationType,
    }));

    return { entities, relations };
  }

  async searchNodes(query: string): Promise<KnowledgeGraph> {
    const graph = await this.readGraph();
    return searchGraph(graph, query);
  }

  async openNodes(names: string[]): Promise<KnowledgeGraph> {
    const graph = await this.readGraph();
    return openGraph(graph, names);
  }

  async createEntities(entities: Entity[]): Promise<Entity[]> {
    const created: Entity[] = [];

    // Keep behavior consistent with JSONL backend: only add observations for
    // newly-created entities.
    for (const e of entities) {
      const inserted = (await this.sql`
        INSERT INTO mcp_entities (name, entity_type)
        VALUES (${e.name}, ${e.entityType})
        ON CONFLICT (name) DO NOTHING
        RETURNING name
      `) as Array<{ name: string }>;

      if (inserted.length === 0) continue;

      for (const obs of e.observations ?? []) {
        await this.sql`
          INSERT INTO mcp_observations (entity_name, content)
          VALUES (${e.name}, ${obs})
          ON CONFLICT (entity_name, content) DO NOTHING
        `;
      }

      created.push({ ...e, observations: [...(e.observations ?? [])] });
    }

    return created;
  }

  async createRelations(relations: Relation[]): Promise<Relation[]> {
    const created: Relation[] = [];

    for (const r of relations) {
      const inserted = (await this.sql`
        INSERT INTO mcp_relations (from_name, to_name, relation_type)
        VALUES (${r.from}, ${r.to}, ${r.relationType})
        ON CONFLICT (from_name, to_name, relation_type) DO NOTHING
        RETURNING from_name
      `) as Array<{ from_name: string }>;

      if (inserted.length === 0) continue;
      created.push(r);
    }

    return created;
  }

  async addObservations(
    observations: ObservationAdd[]
  ): Promise<ObservationAddResult[]> {
    const results: ObservationAddResult[] = [];

    for (const o of observations) {
      const exists = (await this.sql`
        SELECT 1 as ok FROM mcp_entities WHERE name = ${o.entityName} LIMIT 1
      `) as Array<{ ok: number }>;

      if (exists.length === 0) {
        throw new Error(`Entity with name ${o.entityName} not found`);
      }

      const added: string[] = [];
      for (const content of o.contents) {
        const inserted = (await this.sql`
          INSERT INTO mcp_observations (entity_name, content)
          VALUES (${o.entityName}, ${content})
          ON CONFLICT (entity_name, content) DO NOTHING
          RETURNING content
        `) as Array<{ content: string }>;

        if (inserted.length > 0) added.push(content);
      }

      results.push({ entityName: o.entityName, addedObservations: added });
    }

    return results;
  }

  async deleteEntities(entityNames: string[]): Promise<void> {
    for (const name of entityNames) {
      await this.sql`DELETE FROM mcp_entities WHERE name = ${name}`;
      await this
        .sql`DELETE FROM mcp_relations WHERE from_name = ${name} OR to_name = ${name}`;
    }
  }

  async deleteObservations(deletions: ObservationDeletion[]): Promise<void> {
    for (const d of deletions) {
      for (const obs of d.observations) {
        await this.sql`
          DELETE FROM mcp_observations
          WHERE entity_name = ${d.entityName} AND content = ${obs}
        `;
      }
    }
  }

  async deleteRelations(relations: Relation[]): Promise<void> {
    for (const r of relations) {
      await this.sql`
        DELETE FROM mcp_relations
        WHERE from_name = ${r.from}
          AND to_name = ${r.to}
          AND relation_type = ${r.relationType}
      `;
    }
  }
}

export function getPostgresConnectionStringFromEnv(): string {
  const value =
    process.env.POSTGRES_CONNECTION_STRING ??
    process.env.DATABASE_URL ??
    process.env.POSTGRES_URL;

  if (!value) {
    throw new Error(
      "Postgres backend selected but no connection string provided. Set POSTGRES_CONNECTION_STRING (or DATABASE_URL)."
    );
  }

  return value;
}
