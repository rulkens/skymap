import type { Label3DProducer } from '../subsystems/Label3DProducer';
import type { Label3DProducerOutput } from '../subsystems/Label3DProducerOutput';
import type { EngineState } from '../state/EngineState';
import type { FrameView } from '../frame/FrameView';
import type { FadeParam } from '../../animation/FadeParam';
import type { LabelAddress } from '../../animation/LabelAddress';
import type { LabelName } from '../../animation/LabelName';

/** A Layer's world-anchored label producer: `LayerScreenLabel`'s `label` rule, over
 * `produceLabels3D`. */
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
