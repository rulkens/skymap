/**
 * Selection — a (source, localIdx) pair identifying a single galaxy in the
 * loaded catalogues.
 *
 * What the picker decodes from its r32uint packed value, and what the engine
 * forwards to React for InfoCard rendering + halo shading.
 *
 * Re-exported (alongside `EnginePickingState`) for backward compatibility
 * with existing imports — the pre-D.3 subsystems' API surface used this type
 * name; the canonical home in code is now `SelectionInput` on
 * `selectionSubsystem.ts`, which is structurally identical.
 */

import type { Source } from '../../../data/sources';

export type Selection = { source: Source; localIdx: number };
