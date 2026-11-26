import type { ContentPass } from './ContentPass';

/** What differs between the label passes: one row per label director's draw. */
export type LabelsPassRow = {
  readonly name: ContentPass['name'];
  /** The director whose records this pass draws. */
  readonly slab: number;
  /** One renderer holds one director's upload, so each row names its own pair. */
  readonly renderer: 'labelRendererCosmo' | 'labelRendererNear';
  readonly pickRenderer: 'labelPickRendererCosmo' | 'labelPickRendererNear';
  readonly pickTarget?: ContentPass['pickTarget'];
};
