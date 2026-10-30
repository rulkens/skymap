/**
 * The core prerequisites a Layer's `create` is handed — no more: `GpuHandleConstructDeps`
 * (whose job `create` inherits) minus `fontAtlases`, plus the core capabilities a
 * Layer's own subsystems close over today. `publish` is conditional on `Facts` (Ruling 7):
 * a factless Layer calling it is a `tsc` error at the call site, never a runtime throw.
 * No fade registry: core drives every fade from the Layer's `visibility` entries and its
 * asset rows' `gates`, never from a Layer's `create`.
 */

import type { GpuContext } from '../../rendering/GpuContext';
import type { FadeUniformsBgl } from '../../rendering/FadeUniformsBgl';
import type { SourceUniformsBgl } from '../../rendering/SourceUniformsBgl';
import type { FocusUniformsBgl } from '../../rendering/FocusUniformsBgl';
import type { FocusUniformBuffer } from '../../rendering/FocusUniformBuffer';
import type { EngineSettingsState } from '../../settings/EngineSettingsState';

export type LayerCoreDeps<Facts = undefined> = {
  readonly ctx: GpuContext;
  readonly fadeBgl: FadeUniformsBgl;
  readonly sourceBgl: SourceUniformsBgl;
  readonly focusBgl: FocusUniformsBgl;
  /** Core-owned; Layers are destroyed before core (D8), so the capture is safe. */
  readonly focusUniform: FocusUniformBuffer;
  /** This frame's settings, read lazily; no Layer needs the store itself (nothing dispatches or subscribes). */
  readonly settings: () => Readonly<EngineSettingsState>;
  /** Core UI fact: whether the debug panel is open, read lazily. */
  readonly debugPanelOpen: () => boolean;
  /** `state.subsystems.scheduler.requestRender` — core's render-wake. */
  readonly requestRender: () => void;
} & ([Facts] extends [undefined] ? object : { readonly publish: (patch: Partial<Facts>) => void });
