import type { CSSProperties } from 'react';

/** The style that holds back a `data-reveal` element's entrance by `ms` (styles/reveal.client.ts reads it). */
export function revealDelay(ms: number): CSSProperties {
  return { '--reveal-delay': `${ms}ms` } as CSSProperties;
}
