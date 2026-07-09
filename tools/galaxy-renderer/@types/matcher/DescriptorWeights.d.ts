/**
 * DescriptorWeights — per-channel weighting applied by `descriptorLoss` when
 * collapsing the gap between two `GalaxyDescriptor`s into a single scalar. The
 * fit planner picks these per morphological category (e.g. arm weight goes to
 * zero for ellipticals, where spiral harmonics are meaningless), so the same
 * loss function serves every galaxy type without branching.
 */

export type DescriptorWeights = {
  readonly profile: number;
  readonly q: number;
  readonly color: number;
  readonly arm: number;
  readonly dust: number;
};
