import type { FileNode } from './FileNode';
import type { ImportEdge } from './ImportEdge';

export type ImportGraph = {
  readonly nodes: Readonly<Record<string, FileNode>>;
  readonly edges: readonly ImportEdge[];
};
