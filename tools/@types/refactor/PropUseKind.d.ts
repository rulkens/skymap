export type PropUseKind =
  | 'read'
  | 'write'
  | 'shorthand-write'
  | 'destructure'
  | 'shorthand-destructure'
  | 'string-key'
  | 'doc-link'; // a `{@link Type.prop}` in a comment
