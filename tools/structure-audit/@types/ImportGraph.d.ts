import type { FileNode } from './FileNode';
import type { ImportEdge } from './ImportEdge';

/** Every `src/` TypeScript file and every resolved relative import between them. */
export type ImportGraph = {
  readonly nodes: Readonly<Record<string, FileNode>>;
  readonly edges: readonly ImportEdge[];
};
