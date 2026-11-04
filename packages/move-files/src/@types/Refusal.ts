export type Refusal = {
  readonly code:
    | 'missing-source'
    | 'occupied-destination'
    | 'duplicate-source'
    | 'duplicate-destination'
    | 'outside-repo'
    | 'companion-unplaceable'
    | 'case-collision';
  readonly path: string;
  readonly detail: string;
};
