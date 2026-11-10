/**
 * The studio's key table, read by the dock's handler (`useStudioKeys`) and by the `?` overlay, so a
 * key is documented exactly where it is bound (Q30: keys are never printed on the bar, only here and
 * in tooltips). Plain arrows and Home/End only match unmodified, leaving the app's ⌥/⌘ shortcuts alone.
 */
import type { StudioKey } from '../@types/StudioKey';

const plain = (event: Parameters<StudioKey['matches']>[0]) =>
  !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
const undoKey = (event: Parameters<StudioKey['matches']>[0]) =>
  (event.metaKey || event.ctrlKey) && !event.altKey && event.key.toLowerCase() === 'z';

export const STUDIO_KEYS: readonly StudioKey[] = [
  {
    id: 'previous',
    group: 'Steps',
    label: 'Previous step',
    chips: ['↑'],
    matches: (e) => plain(e) && e.key === 'ArrowUp',
  },
  {
    id: 'next',
    group: 'Steps',
    label: 'Next step',
    chips: ['↓'],
    matches: (e) => plain(e) && e.key === 'ArrowDown',
  },
  {
    id: 'fold',
    group: 'Steps',
    label: 'Fold',
    chips: ['←'],
    matches: (e) => plain(e) && e.key === 'ArrowLeft',
  },
  {
    id: 'unfold',
    group: 'Steps',
    label: 'Unfold',
    chips: ['→'],
    matches: (e) => plain(e) && e.key === 'ArrowRight',
  },
  {
    id: 'escape',
    group: 'Steps',
    label: 'Deselect, then close',
    chips: ['Esc'],
    matches: (e) => plain(e) && e.key === 'Escape',
  },
  {
    id: 'start',
    group: 'Playhead',
    label: 'To start',
    chips: ['Home'],
    matches: (e) => plain(e) && e.key === 'Home',
  },
  {
    id: 'end',
    group: 'Playhead',
    label: 'To end',
    chips: ['End'],
    matches: (e) => plain(e) && e.key === 'End',
  },
  {
    id: 'undo',
    group: 'Clip',
    label: 'Undo',
    chips: ['⌘', 'Z'],
    matches: (e) => undoKey(e) && !e.shiftKey,
  },
  {
    id: 'redo',
    group: 'Clip',
    label: 'Redo',
    chips: ['⇧', '⌘', 'Z'],
    matches: (e) => undoKey(e) && e.shiftKey,
  },
  {
    id: 'help',
    group: 'Clip',
    label: 'Keys',
    chips: ['?'],
    matches: (e) => e.key === '?' && !e.metaKey && !e.ctrlKey && !e.altKey,
  },
];
