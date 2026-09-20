export type StateSite = {
  readonly f: string;
  readonly area: string;
  readonly line: number;
  readonly text?: string;
  readonly name?: string;
  readonly kind?: string;
  readonly role?: 'lookup' | 'cache' | 'mutable';
};

export type StateCount = {
  readonly f: string;
  readonly area: string;
  readonly n: number;
  readonly code?: number;
};

/** Where mutable state sits outside RTK; every list is a regex heuristic, see README. */
export type StateInventory = {
  readonly moduleLet: readonly StateSite[];
  readonly containers: readonly StateSite[];
  readonly slices: readonly StateSite[];
  readonly classes: readonly StateSite[];
  readonly reactState: readonly StateCount[];
  readonly closure: readonly StateCount[];
};
