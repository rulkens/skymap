/** Typed text checked against a slider's range: the stored value, or why it cannot be committed. */
export type TypedValueCheck =
  | { kind: 'valid'; value: number }
  | { kind: 'incomplete' }
  | { kind: 'notNumber' }
  | { kind: 'outOfRange' };
