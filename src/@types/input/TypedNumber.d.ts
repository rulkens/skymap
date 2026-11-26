/** Typed text read as a number: the value, a half-typed one (`-`, `1e`, empty), or not a number at all. */
export type TypedNumber = number | 'incomplete' | 'invalid';
