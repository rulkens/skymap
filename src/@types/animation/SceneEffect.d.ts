/**
 * SceneEffect — the scene changes a clip can make: what is drawn, never where the camera is.
 * `compileClip` turns them into steps applied from their `atSec` on (`CompiledClip.scene`);
 * the engine reads intent with the applied steps folded in, and the clip never dispatches
 * them (ADR 0017). `show`/`hide` move a switch, `fade` only the clip factor (back to 1 at
 * the end), `scene` one approved settings action, `focus` the selection focus (`null`
 * clears), `frameTo` the orientation frame, rolled from the live up-basis over `over` s.
 * Each awaits zero time. `effectHelpers.ts` is the only constructor. `args` are the visibility addresses
 * `APP_VISIBILITY_REGISTRY` derives (`'labels'` expanded at construction); `show`/`hide`
 * also take one item of a per-item entry (`'survey:milliquas'`); `fade` has no scoped form.
 */

import type { VisibilityAddress } from './VisibilityAddress';
import type { ScopedVisibilityAddress } from './ScopedVisibilityAddress';
import type { SettingsAction } from '../../compositions/@types/SettingsAction';
import type { OrientationFrameId } from '../camera/orientation/OrientationFrameId';
import type { Ease } from './Ease';
import type { SelectionRefBase } from '../engine/selection/SelectionRefBase';

export type SceneEffect =
  | {
      readonly kind: 'show';
      readonly args: (VisibilityAddress | ScopedVisibilityAddress)[];
      readonly over?: number;
    }
  | {
      readonly kind: 'hide';
      readonly args: (VisibilityAddress | ScopedVisibilityAddress)[];
      readonly over?: number;
    }
  | {
      readonly kind: 'fade';
      readonly args: VisibilityAddress[];
      readonly to: number;
      readonly over: number;
    }
  | {
      readonly kind: 'scene';
      readonly action: SettingsAction;
    }
  | {
      readonly kind: 'focus';
      readonly ref: SelectionRefBase | null;
    }
  | {
      readonly kind: 'frameTo';
      readonly frame: OrientationFrameId;
      readonly over: number;
      readonly ease: Ease;
    };
