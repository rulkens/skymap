import type { SelectionKindRow } from './SelectionKindRow';
import type { ReadyFrameContext } from '../frame/ReadyFrameContext';
import type { PassState } from '../frame/PassState';

/** A Layer bound to its own `Runtime` by `instantiateLayer`, once, at `createLayers`. */
export type LayerInstance = {
  readonly name: string;
  readonly selection: readonly SelectionKindRow[];
  readonly frame: ((ctx: ReadyFrameContext, state: PassState) => boolean) | null;
  destroy(): void;
};
