/** One chunk the planner wants this frame; `priority` is its refine proxy. */
export type OctreeChunkRequest = { readonly chunkRef: number; readonly priority: number };
