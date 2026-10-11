/**
 * One octree source's chunk stream: a fixed pool of slots, LRU by the frame a
 * chunk was last planned, fetching what the planner asks for and writing what
 * lands through the renderer. A landed chunk's decoded copy stays with its slot.
 */

import type { Destroyable } from '../../../@types/rendering/Destroyable';
import type { StarChunk } from '../../../@types/data/starCatalog/StarChunk';
import type { StarChunkRequest } from './StarChunkRequest';

export type StarChunkStream = Destroyable & {
  /** Pool size: the most chunks it holds, and so the most one update can fund. */
  readonly slots: number;
  /** Touches resident chunks, then allocates and enqueues `requests` (descending priority, as the planner orders them) until the pool refuses. */
  update(frame: number, touched: readonly number[], requests: readonly StarChunkRequest[]): void;
  isResident(chunkRef: number): boolean;
  /** Its fetch came back empty: it is never asked for again. */
  hasFailed(chunkRef: number): boolean;
  /** The CPU copy while its slot holds it. */
  resident(chunkRef: number): StarChunk | null;
  inFlightCount(): number;
  /** Increments on every landing and eviction; the planner's wake and fade reset read it. */
  epoch(): number;
};
