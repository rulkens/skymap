/** How one `FieldControl` is drawn and converted: the widget, its unit suffix, and stored ↔ shown numbers. */
export type FieldWidget = {
  readonly widget:
    | 'number'
    | 'pick'
    | 'toggle'
    | 'readout'
    | 'layers'
    | 'settingsAction'
    | 'object'
    | 'spline'
    | 'passBy'
    | 'waypoints';
  /** Layers widget: offer a per-item entry's items too. */
  readonly items?: boolean;
  /** Object widget: what a pick stores, the object's focus id, position or selection ref. */
  readonly pick?: 'focusId' | 'position' | 'ref';
  /** Object widget: also offers None, stored as null. */
  readonly clearable?: true;
  readonly unit?: string;
  /** A function steps relative to the shown value (Mpc spans many decades). */
  readonly step?: number | ((shown: number) => number);
  readonly min?: number;
  /** With `min`, the number widget becomes a slider. */
  readonly max?: number;
  /** Stored value to the number the field shows; absent means they are the same. */
  readonly toDisplay?: (stored: number) => number;
  readonly fromDisplay?: (shown: number) => number;
};
