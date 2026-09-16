/**
 * The core prerequisites a Layer's `create` is handed — no more: `GpuHandleConstructDeps`
 * (whose job `create` inherits) minus `fontAtlases`, plus the core capabilities a
 * Layer's own subsystems close over today. `publish` is conditional on `Facts` (Ruling 7):
 * a factless Layer calling it is a `tsc` error at the call site, never a runtime throw.
 * No `fades`: a Layer reads opacity through `state.subsystems.fades` in its passes but
 * cannot drive a fade at construction — core owns that edge (`installFadeOnArrival`).
 */

import type { GpuContext } from '../../rendering/GpuContext';
import type { FadeUniformsBgl } from '../../rendering/FadeUniformsBgl';
import type { SourceUniformsBgl } from '../../rendering/SourceUniformsBgl';
import type { FocusUniformsBgl } from '../../rendering/FocusUniformsBgl';
import type { FocusUniformBuffer } from '../../rendering/FocusUniformBuffer';
import type { SourceType } from '../../data/SourceType';
import type { AppStore } from '../../../store/types';

export type LayerCoreDeps<Facts = undefined> = {
  readonly ctx: GpuContext;
  readonly fadeBgl: FadeUniformsBgl;
  readonly sourceBgl: SourceUniformsBgl;
  readonly focusBgl: FocusUniformsBgl;
  /** Core-owned; Layers are destroyed before core (D8), so the capture is safe. */
  readonly focusUniform: FocusUniformBuffer;
  /** Core settings reads and this Layer's own dispatches; already `createEngine`'s `cb.store`. */
  readonly store: AppStore;
  /** `state.subsystems.scheduler.requestRender` — core's render-wake. */
  readonly requestRender: () => void;
  readonly reportSourceCount: (source: SourceType, count: number) => void;
} & ([Facts] extends [undefined] ? object : { readonly publish: (patch: Partial<Facts>) => void });
