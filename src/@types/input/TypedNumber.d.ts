/** A typed number read against a range: the value, a half-typed one (`-`, `1e`, empty), or one that cannot be committed. */
export type TypedNumber = number | 'incomplete' | 'invalid';
