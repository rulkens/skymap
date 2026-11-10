/** How one `FieldControl` is drawn and converted: the widget, its unit suffix, and stored ↔ shown numbers. */
export type FieldWidget = {
  readonly widget: 'number' | 'pick' | 'toggle' | 'readout';
  readonly unit?: string;
  readonly step?: number;
  readonly min?: number;
  /** With `min`, the number widget becomes a slider. */
  readonly max?: number;
  /** Stored value to the number the field shows; absent means they are the same. */
  readonly toDisplay?: (stored: number) => number;
  readonly fromDisplay?: (shown: number) => number;
};
