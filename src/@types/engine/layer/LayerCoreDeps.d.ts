/**
 * The core prerequisites a Layer's `create` is handed — no more: `GpuHandleConstructDeps`
 * (whose job `create` inherits) minus `fontAtlases`, plus the two core capabilities a
 * Layer's own subsystems close over today.
 */

import type { GpuContext } from '../../rendering/GpuContext';
import type { FadeUniformsBgl } from '../../rendering/FadeUniformsBgl';
import type { SourceUniformsBgl } from '../../rendering/SourceUniformsBgl';
import type { FocusUniformsBgl } from '../../rendering/FocusUniformsBgl';
import type { AppStore } from '../../../store/types';

export type LayerCoreDeps = {
  readonly ctx: GpuContext;
  readonly fadeBgl: FadeUniformsBgl;
  readonly sourceBgl: SourceUniformsBgl;
  readonly focusBgl: FocusUniformsBgl;
  /** Core settings reads and this Layer's own dispatches; already `createEngine`'s `cb.store`. */
  readonly store: AppStore;
  /** `state.subsystems.scheduler.requestRender` — core's render-wake. */
  readonly requestRender: () => void;
};
