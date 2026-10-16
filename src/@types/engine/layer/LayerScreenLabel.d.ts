import type { Label2DProducer } from '../subsystems/Label2DProducer';
import type { Label2DProducerOutput } from '../subsystems/Label2DProducerOutput';
import type { EngineState } from '../state/EngineState';
import type { FrameView } from '../frame/FrameView';
import type { FadeParam } from '../../animation/FadeParam';
import type { LabelAddress } from '../../animation/LabelAddress';
import type { LabelName } from '../../animation/LabelName';

/** A Layer's screen-space label producer plus the slab whose director projects it. A row
 * naming its `label` entry is skipped while no item of it is live, and otherwise gets the
 * entry's handed value as `produceLabels`' third argument. */
export type LayerScreenLabel<L extends LabelName = LabelName> = Omit<
  Label2DProducer,
  'produceLabels'
> & {
  readonly slab: number;
  readonly label?: L;
  produceLabels(
    state: EngineState,
    ctx: FrameView,
    ...fade: FadeParam<`label:${L}`, LabelAddress>
  ): Label2DProducerOutput;
};
