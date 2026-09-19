/**
 * Public surface of the Local Bubble shell renderer. `upload`/`hasMesh`/
 * `destroy` land in the layer scaffold; `draw` follows once the pipeline and
 * shaders exist (Task 6).
 */

import type { ShellMesh } from '../data/shellMesh/ShellMesh';

export type LocalBubbleRenderer = {
  readonly label: string;
  upload(mesh: ShellMesh): void;
  /** True once a drawable mesh is committed — the fade row's guard reads this. */
  hasMesh(): boolean;
  destroy(): void;
};
