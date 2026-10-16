/** One visibility switch to write: `settings[cluster][field]`, or that field of one item row. */
export type SetVisibilityPayload = {
  readonly cluster: string;
  readonly item?: string;
  readonly field: 'enabled' | 'labelEnabled';
  readonly on: boolean;
};
