/**
 * The core prerequisites a Layer's `create` is handed — no more: `GpuHandleConstructDeps`
 * (whose job `create` inherits) minus `fontAtlases`, plus the core capabilities a
 * Layer's own subsystems close over today. `publish` is conditional on `Facts` (Ruling 7):
 * a factless Layer calling it is a `tsc` error at the call site, never a runtime throw.
 * No fade registry: core drives every fade from the Layer's `visibility` entries and its
 * asset rows' `gates`, never from a Layer's `create`.
 */

import type { GpuContext } from '../../../../packages/shared/src/@types/rendering/GpuContext';
import type { FadeUniformsBgl } from '../../rendering/FadeUniformsBgl';
import type { SourceUniformsBgl } from '../../rendering/SourceUniformsBgl';
import type { FocusUniformsBgl } from '../../rendering/FocusUniformsBgl';
import type { FocusUniformBuffer } from '../../rendering/FocusUniformBuffer';
import type { Tier } from '../../../../packages/shared/src/@types/data/Tier';
import type { EngineSettingsState } from '../../settings/EngineSettingsState';
import type { MeshBodiesSink } from './MeshBodiesSink';

export type LayerCoreDeps<Facts = undefined> = {
  readonly ctx: GpuContext;
  readonly fadeBgl: FadeUniformsBgl;
  readonly sourceBgl: SourceUniformsBgl;
  readonly focusBgl: FocusUniformsBgl;
  /** Core-owned; Layers are destroyed before core (D8), so the capture is safe. */
  readonly focusUniform: FocusUniformBuffer;
  /** The live engine settings, read at call time. */
  readonly settings: () => Readonly<EngineSettingsState>;
  /** Core UI fact: whether the debug panel is open, read lazily. */
  readonly debugPanelOpen: () => boolean;
  /** The store's active data tier, read at call time. */
  readonly tier: () => Tier;
  /** `state.subsystems.scheduler.requestRender` — core's render-wake. */
  readonly requestRender: () => void;
  /** This app's pick code for one of the Layer's pick sources; stable for the session, never persisted. */
  readonly pickCode: (pickSourceId: string) => number;
  /** What a Layer's mesh asset rows commit to and release from (`meshAssetRow`). */
  readonly meshBodies: MeshBodiesSink;
} & ([Facts] extends [undefined] ? object : { readonly publish: (patch: Partial<Facts>) => void });
