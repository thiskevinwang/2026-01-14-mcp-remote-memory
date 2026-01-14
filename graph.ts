export interface Entity {
  name: string;
  entityType: string;
  observations: string[];
}

export interface Relation {
  from: string;
  to: string;
  relationType: string;
}

export interface KnowledgeGraph {
  entities: Entity[];
  relations: Relation[];
}

export function searchGraph(
  graph: KnowledgeGraph,
  query: string
): KnowledgeGraph {
  const q = query.toLowerCase();

  const filteredEntities = graph.entities.filter(
    (e) =>
      e.name.toLowerCase().includes(q) ||
      e.entityType.toLowerCase().includes(q) ||
      e.observations.some((o) => o.toLowerCase().includes(q))
  );

  const filteredEntityNames = new Set(filteredEntities.map((e) => e.name));

  const filteredRelations = graph.relations.filter(
    (r) => filteredEntityNames.has(r.from) && filteredEntityNames.has(r.to)
  );

  return {
    entities: filteredEntities,
    relations: filteredRelations,
  };
}

export function openGraph(
  graph: KnowledgeGraph,
  names: string[]
): KnowledgeGraph {
  const nameSet = new Set(names);

  const filteredEntities = graph.entities.filter((e) => nameSet.has(e.name));

  const filteredEntityNames = new Set(filteredEntities.map((e) => e.name));

  const filteredRelations = graph.relations.filter(
    (r) => filteredEntityNames.has(r.from) && filteredEntityNames.has(r.to)
  );

  return {
    entities: filteredEntities,
    relations: filteredRelations,
  };
}
