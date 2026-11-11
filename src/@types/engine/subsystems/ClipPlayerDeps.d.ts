import type { RootState, AppDispatch } from '../../../store/types';
import type { CameraRuntime } from '../state/CameraRuntime';
import type { SelectionRefBase } from '../selection/SelectionRefBase';
import type { FocusRow } from '../../animation/compiledClip/FocusRow';
import type { EngineSettingsState } from '../../settings/EngineSettingsState';
import type { FadeIdentity } from '../../animation/FadeIdentity';
import type { FadeRegistry } from '../../animation/FadeRegistry';

/** What `createClipPlayer` needs from the engine; `engine.ts` builds each from its own state. */
export type ClipPlayerDeps = {
  /** Reads `camera.clip` (intent, never the view) and takes the end commit and frame rolls. */
  readonly store: { getState(): RootState; dispatch: AppDispatch };
  /** Live, read when a frame roll starts: the roll begins at the drawn up-basis. */
  readonly getCameraRuntime: () => CameraRuntime;
  /** The focus row for `ref`, as `watchSelectionRowsSaga` extracts it. Called from `tick` only. */
  readonly extractFocusRow: (ref: SelectionRefBase | null) => FocusRow;
  /** Re-targets every visibility fade against `settings`; `overMs` as a `setVisibility` carries it. */
  readonly syncVisibility: (settings: EngineSettingsState, overMs?: number) => void;
  /** Every fade identity with its visibility target under each of `settings`, in order: a seed's table. */
  readonly visibilityTargets: (
    settings: readonly EngineSettingsState[],
  ) => readonly { readonly id: FadeIdentity; readonly targets: readonly number[] }[];
  /** The registry, read when a seed lands: values set outright, ramps resumed for their remaining time. */
  readonly getFades: () => Pick<FadeRegistry, 'setImmediate' | 'fadeTo'>;
};
