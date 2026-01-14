import type { Entity, KnowledgeGraph, Relation } from "../graph";

export type ObservationAdd = { entityName: string; contents: string[] };
export type ObservationAddResult = {
  entityName: string;
  addedObservations: string[];
};

export type ObservationDeletion = {
  entityName: string;
  observations: string[];
};

export interface KnowledgeGraphStore {
  /** Optional backend initialization (e.g. migrations). */
  migrate?(): Promise<void>;

  createEntities(entities: Entity[]): Promise<Entity[]>;
  createRelations(relations: Relation[]): Promise<Relation[]>;

  addObservations(
    observations: ObservationAdd[]
  ): Promise<ObservationAddResult[]>;

  deleteEntities(entityNames: string[]): Promise<void>;
  deleteObservations(deletions: ObservationDeletion[]): Promise<void>;
  deleteRelations(relations: Relation[]): Promise<void>;

  readGraph(): Promise<KnowledgeGraph>;
  searchNodes(query: string): Promise<KnowledgeGraph>;
  openNodes(names: string[]): Promise<KnowledgeGraph>;

  close?(): Promise<void>;
}

export type StorageBackendFactory = (args: {
  baseDir: string;
}) => Promise<KnowledgeGraphStore> | KnowledgeGraphStore;
