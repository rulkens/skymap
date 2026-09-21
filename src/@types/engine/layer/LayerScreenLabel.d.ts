import type { Label2DProducer } from '../subsystems/Label2DProducer';

/** A Layer's screen-space label producer plus the slab whose director projects it. */
export type LayerScreenLabel = Label2DProducer & { readonly slab: number };
