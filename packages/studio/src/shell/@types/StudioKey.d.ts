/** One row of the key table: how a key is matched, and how the `?` overlay names and groups it. */
import type { StudioKeyId } from './StudioKeyId';

export type StudioKey = {
  readonly id: StudioKeyId;
  readonly group: 'Steps' | 'Playhead' | 'Clip';
  readonly label: string;
  /** The keycaps, in press order: `['⇧', '⌘', 'Z']`. */
  readonly chips: readonly string[];
  readonly matches: (
    event: Pick<KeyboardEvent, 'key' | 'metaKey' | 'ctrlKey' | 'shiftKey' | 'altKey'>,
  ) => boolean;
};
