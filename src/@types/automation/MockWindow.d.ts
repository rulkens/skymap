/**
 * MockWindow — `Window` widened with the `?mock=` mount's HMR counter: 1 after the
 * mock's first render, +1 per applied Vite update. `npm run mock` waits for it to
 * move before re-shooting.
 */
export type MockWindow = Window & { __mockRevision?: number };
