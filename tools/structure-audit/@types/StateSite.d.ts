/** One state-bearing source line; `role` classification for Map/Set/WeakMap hits lives in `scanState.ts`. */
export type StateSite = {
  readonly f: string;
  readonly area: string;
  readonly line: number;
  readonly text?: string;
  readonly name?: string;
  readonly kind?: string;
  readonly role?: 'lookup' | 'cache' | 'mutable';
};
