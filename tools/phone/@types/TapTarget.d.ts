import type { Point } from './Point';

export type TapTarget =
  | { readonly kind: 'point'; readonly point: Point }
  | { readonly kind: 'selector'; readonly selector: string };
