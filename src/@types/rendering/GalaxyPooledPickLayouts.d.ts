/** The pooled point pipeline's `@group(1)` (the cut) and `@group(2)` (records) layouts, which its pick pipeline shares. */
export type GalaxyPooledPickLayouts = {
  readonly drawBgl: GPUBindGroupLayout;
  readonly recordsBgl: GPUBindGroupLayout;
};
