import type { Label3DProducer } from '../subsystems/Label3DProducer';
import type { Label3DProducerOutput } from '../subsystems/Label3DProducerOutput';
import type { EngineState } from '../state/EngineState';
import type { FrameView } from '../frame/FrameView';
import type { FadeParam } from '../../animation/FadeParam';
import type { LabelAddress } from '../../animation/LabelAddress';
import type { LabelName } from '../../animation/LabelName';

/** A Layer's world-anchored label producer. A row naming its `label` entry is skipped while
 * no item of it is live, and otherwise gets the entry's handed value as `produceLabels3D`'s
 * third argument. */
export type LayerWorldLabel<L extends LabelName = LabelName> = Omit<
  Label3DProducer,
  'produceLabels3D'
> & {
  produceLabels3D(
    state: EngineState,
    ctx: FrameView,
    ...fade: FadeParam<`label:${L}`, LabelAddress>
  ): Label3DProducerOutput;
} & ([LabelName] extends [L] ? { readonly label?: L } : { readonly label: L });
