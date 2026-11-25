/** What {@link import('../weslStructLayout').weslStructLayout} reports for one WGSL struct. */
export type WeslStructLayout = {
  /** Declaration order; `offset` and `size` in bytes. */
  readonly fields: readonly {
    readonly name: string;
    readonly type: string;
    readonly offset: number;
    readonly size: number;
  }[];
  /** The struct's byte size under the address space's rounding rule. */
  readonly size: number;
};
