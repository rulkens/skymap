// Keyed by the Rotate button's step; `failed` is a write that did not land, and the old code stays.
export const ROTATE_LABEL = {
  idle: 'Rotate code',
  confirm: 'Disconnect tablets and rotate',
  rotating: 'Disconnect tablets and rotate',
  failed: 'Rotate code',
} as const;

export const ROTATE_HINT = {
  idle: 'Disconnects paired tablets and changes the address.',
  confirm: 'Every paired tablet disconnects. Escape cancels.',
  rotating: 'Rotating the code',
  failed: 'Could not store a new code. Check the disk has free space, then try again.',
} as const;
