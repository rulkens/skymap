import type { HiiTier } from '../../starFormation/@types/HiiTier';

export type FieldBindGroups = {
  readonly dustMap: GPUBindGroup;
  readonly fieldSplat: GPUBindGroup;
  readonly dustPresent: GPUBindGroup;
  readonly hii: GPUBindGroup;
  tier(kind: HiiTier): GPUBindGroup;
};
