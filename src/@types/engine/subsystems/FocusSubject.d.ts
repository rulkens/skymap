import type { FocusSphere } from '../../rendering/FocusSphere';
import type { SelectionRefBase } from '../selection/SelectionRefBase';

/** What the focus ramp fades toward: the focused ref and its sphere, if it has one. */
export type FocusSubject = {
  readonly ref: SelectionRefBase;
  readonly sphere: FocusSphere | null;
};
