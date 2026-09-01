/**
 * createGalaxyRenderTargets — every offscreen whose size follows the canvas.
 * The runtime keeps its equivalents in a `renderTargets` table carrying volume
 * / foreground rows this tool never draws, so the tool allocates its own `hdr`,
 * `mw-aggregate` and `bloom0..4` rows at the same formats and divisors.
 * `ldrTex` has no runtime counterpart: it is only the intermediate the
 * tool-only grade trailer reads. Bind groups are not cached here — the shared
 * pass factories rebuild theirs per draw. The engine's several that bind
 * `dustMapTex` can't; hence the callback.
 */
import type { HiiTier } from '../../../../../src/@types/galaxy/HiiTier';
import type { Vec2 } from '../../../../../src/@types/math/Vec2';

import { BLOOM_LEVELS, bloomScale } from '../../../../../src/data/bloomConstants';
import { HII_TIERS } from '../../data/hiiTiers';
import { reducedTargetSize } from '../../../../../src/utils/gpu/reducedTargetSize';

/**
 * The reduced targets' divisors, each its own live slider — `tiers` is keyed
 * by `HiiTier` (`data/hiiTiers.ts`'s `HII_TIERS`) rather than three more
 * named fields, so a fourth tier is one table row, not a third field here
 * plus a third `reallocateIfResized` call below.
 */
export type TargetDivisors = {
  readonly aggregate: number;
  readonly field: number;
  readonly dust: number;
  readonly hii: number;
  readonly tiers: Readonly<Record<HiiTier, number>>;
};

/**
 * Textures are getters, never snapshot properties: every one of them is
 * replaced by a resize or a divisor drag, and a caller holding the object
 * across frames must still see the live texture.
 */
type GalaxyRenderTargets = {
  readonly sceneTex: GPUTexture;
  readonly ldrTex: GPUTexture;
  readonly aggregateTex: GPUTexture;
  readonly fieldTex: GPUTexture;
  readonly dustMapTex: GPUTexture;
  readonly hiiTex: GPUTexture;
  /** One of the three generalized HII sub-tiers' own targets — see `allocateTier`'s own doc. */
  tierTex(kind: HiiTier): GPUTexture;
  readonly dustViewTex: GPUTexture;
  readonly bloomMips: readonly GPUTexture[];
  /** Pixel size of a target at `divisor` — also what the passes pack as `viewportPx`. */
  reducedSize(divisor: number): Vec2;
  bloomTexelSize(level: number): Vec2;
  /** Recreate the canvas-sized targets, then bring the reduced ones up to date. */
  rebuildAll(divisors: TargetDivisors): void;
  /**
   * Reallocate whichever reduced targets these divisors no longer describe.
   * Safe to call on every render-bag push: the comparison is against the live
   * textures' pixel sizes, so an unmoved divisor is a no-op.
   */
  setDivisors(divisors: TargetDivisors): void;
  destroy(): void;
};

export function createGalaxyRenderTargets(
  device: GPUDevice,
  canvas: HTMLCanvasElement,
  formats: {
    readonly hdr: GPUTextureFormat;
    readonly swap: GPUTextureFormat;
    readonly dustMap: GPUTextureFormat;
  },
  onDustMapRecreated: () => void,
): GalaxyRenderTargets {
  let sceneTex: GPUTexture;
  let ldrTex: GPUTexture;
  let aggregateTex: GPUTexture;
  /**
   * The analytic field's OWN reduced-resolution target, deliberately not the
   * star aggregate. Both are additive glow folded into HDR by the same
   * upsample, but their spatial frequency is not the same: sprites carry
   * point-like detail that a coarse divisor destroys, while the field is a
   * sum of wide Gaussians that survives 5x downsampling with no visible
   * change. Sharing one target forced the field to pay the sprites' pixel
   * rate — and it is FILL-bound, so that was most of its cost.
   */
  let fieldTex: GPUTexture;
  /**
   * The dust-column map (see dustMap.wesl): screen-space, four depth-sliced
   * optical-depth channels (io.wesl's dustSlices doc) accumulated for the
   * primary galaxy's dust slice. Sized to ITS OWN divisor,
   * `reducedSize(render.dustDivisor)` — much finer than fieldTex's, because
   * the dust splat carries far higher-frequency structure than the smooth
   * emission field — sharing one target decimates thin lanes into beads
   * (see `allocateDust`). dustPresent.wesl
   * (the JWST view) still reads it via a 1:1 `input.pos.xy` texel lookup, but
   * into its OWN divisor-matched target (`dustViewTex`, not `fieldTex`);
   * dustAttenuation.wesl's componentEmission, which runs at fieldTex's coarser resolution, instead
   * samples it through a linear sampler (`dustMapSmp`) at a normalized UV —
   * see field/io.wesl's DUST MAP doc for why that is a deliberate, imperfect
   * trade rather than an oversight.
   */
  let dustMapTex: GPUTexture;
  /**
   * The HII tier's own target, sized to ITS OWN divisor,
   * `reducedSize(render.extrasDivisor)` — defaults to the canvas itself (1), not
   * `fieldTex`'s coarser one. A shell sprite is small and bright by
   * construction: sharing the field's target once collapsed a whole sprite's
   * flux onto one texel and bloom promoted the spike into a firefly
   * (`docs/research/milky-way/hii-regions.md` — the SAME shape as the bug that
   * split off `dustMapTex`, one tenant later). Drawn by `splatPipe` again (`hiiBG`),
   * composited into HDR through the same `aggregateUpsample` the field and
   * star aggregate use.
   */
  let hiiTex: GPUTexture;
  /**
   * The three generalized HII sub-tiers' own targets (`data/hiiTiers.ts`'s
   * `HII_TIERS`), split off `hiiTex` one at a time — DIG first (the biggest,
   * softest quads in the tier, worst overdraw at close zoom but also the
   * lowest-frequency content, so it tolerates its own much coarser divisor
   * with no visible loss), shells and young stars for the SAME firefly reason
   * `hiiTex` itself split off `fieldTex`: small, bright sprites collapse under
   * a shared coarser texel and bloom promotes the spike into a firefly. A
   * `Map` rather than three more `let`s — `allocateTier` is the one function
   * a fourth tier would extend, not a fourth near-copy of `allocateHii`.
   * Drawn by `splatPipe` again (one bind group per tier, see
   * `createGalaxyEngine.ts`'s `buildTierBindGroup`), composited into HDR
   * through the same `aggregateUpsample` as every other reduced target.
   */
  const tierTextures = new Map<HiiTier, GPUTexture>();
  /**
   * The JWST-view's own presentation target (dustPresent.wesl), divisor-
   * matched to `dustMapTex` rather than `fieldTex` — see `dustMapTex`'s own
   * comment above. Only drawn into while `render.dustViewIntensity` is above
   * 0; the scene pass sums it additively alongside `fieldTex` when it ran
   * this frame (see `drawFrame`).
   */
  let dustViewTex: GPUTexture;
  let bloomMips: GPUTexture[] = [];
  const RA_TB = GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING;

  /**
   * This is also the number the star pass writes into `viewportPx`, which is
   * why it is a function rather than two inline expressions — the allocation
   * and the uniform read it from the same place and so cannot disagree, the
   * same discipline `milkyWayAggregateLayer` follows by reading the divisor
   * off the shared spec row. The sizing rule itself is `reducedTargetSize`.
   */
  const reducedSize = (scale: number): Vec2 =>
    reducedTargetSize(canvas.width, canvas.height, scale);

  // Every divisor is a live slider, which is why each reduced target allocates
  // on its own: moving one must not disturb the scene, the LDR scratch or the
  // bloom pyramid. Reallocating outright (rather than pooling a few sizes) is
  // the right trade for a 1..6 integer knob dragged by hand.
  function allocateAggregate(w: number, h: number): void {
    if (aggregateTex) aggregateTex.destroy();
    aggregateTex = device.createTexture({
      label: 'galaxy:aggregateTex',
      size: [w, h],
      format: formats.hdr,
      usage: RA_TB,
    });
  }

  function allocateField(w: number, h: number): void {
    if (fieldTex) fieldTex.destroy();
    fieldTex = device.createTexture({
      label: 'galaxy:fieldTex',
      size: [w, h],
      format: formats.hdr,
      // COPY_SRC beyond RA_TB's production need: `requestArmCloudRenderedFluxSum`/
      // `requestArmSpurCloudRenderedFluxSum` (createGalaxyEngine.ts) each draw an
      // isolated instance range into this target through the REAL production
      // pipeline, then read it back via `readTextureChannelSum` to observe the
      // arm-cloud/spur-cloud renorm's ACTUAL rendered effect — `dustMapTex`'s own
      // identical precedent below.
      usage: RA_TB | GPUTextureUsage.COPY_SRC,
    });
  }

  // The two dust targets rebuild TOGETHER — dustPresent.wesl reads `dustMapTex`
  // 1:1 into `dustViewTex`, so leaving either behind reintroduces the
  // resolution mismatch the shared divisor exists to prevent.
  //
  // `onDustMapRecreated` is the engine's half of that recreation: three
  // `layout: 'auto'` bind groups are tied to the specific GPUTexture they were
  // built against, and the engine's "dust map holds nonzero texels" latch
  // resets alongside them. That reset asserts the map is zeroed, which is true
  // ONLY of a texture this function just created — so the callback fires from
  // the allocation itself and must never be hoisted to a caller that may skip
  // it.
  function allocateDust(w: number, h: number): void {
    if (dustMapTex) dustMapTex.destroy();
    dustMapTex = device.createTexture({
      label: 'galaxy:dustMapTex',
      size: [w, h],
      format: formats.dustMap,
      // COPY_SRC beyond RA_TB's production need: a debug-only readback
      // (readTextureChannelSum.ts) copies the whole map back to
      // observe the Larson renorm's ACTUAL rendered effect — same "debug
      // readback rides the production texture's own COPY_SRC flag"
      // precedent `fieldComps`/`hiiComps` already establish for buffers.
      usage: RA_TB | GPUTextureUsage.COPY_SRC,
    });
    if (dustViewTex) dustViewTex.destroy();
    dustViewTex = device.createTexture({
      label: 'galaxy:dustViewTex',
      size: [w, h],
      format: formats.hdr,
      usage: RA_TB,
    });
    onDustMapRecreated();
  }

  // Rebuilds no bind group — `hiiBG` references `hiiUbo`/`hiiCompsBuf`/
  // `dustMapTex`, none of which this touches, not `hiiTex` itself (the render
  // PASS binds `hiiTex` as its attachment view, freshly, every `drawFrame`).
  function allocateHii(w: number, h: number): void {
    if (hiiTex) hiiTex.destroy();
    hiiTex = device.createTexture({
      label: 'galaxy:hiiTex',
      size: [w, h],
      format: formats.hdr,
      usage: RA_TB,
    });
  }

  // Rebuilds no bind group, same reason `allocateHii` doesn't — the per-tier
  // bind group references the per-tier UBO/`hiiCompsBuf`/`dustMapTex`, none
  // of which this touches; the render PASS binds the tier's texture as its
  // attachment view freshly every `drawFrame`.
  function allocateTier(kind: HiiTier, w: number, h: number): void {
    tierTextures.get(kind)?.destroy();
    tierTextures.set(
      kind,
      device.createTexture({
        label: `galaxy:hiiTierTex:${kind}`,
        size: [w, h],
        format: formats.hdr,
        usage: RA_TB,
      }),
    );
  }

  /**
   * The ONE allocation path for the reduced targets, keyed on the pixel size
   * already on the live texture rather than on a remembered divisor: the
   * texture is the authoritative record of what it was built at, so a divisor
   * drag and a canvas resize both reduce to the same question, and `rebuildAll`
   * delegates here. Two divisors that floor to the same size — or a resize that
   * floors to the same pixels — genuinely need no reallocation: the surviving
   * texture is the same object every bind group already holds a view of, and
   * the stale-map latch stays at its truthful value (see `allocateDust`).
   */
  function setDivisors(divisors: TargetDivisors): void {
    const reallocateIfResized = (
      tex: GPUTexture | undefined,
      divisor: number,
      allocate: (w: number, h: number) => void,
    ): void => {
      const [w, h] = reducedSize(divisor);
      if (tex && tex.width === w && tex.height === h) return;
      allocate(w, h);
    };
    reallocateIfResized(aggregateTex, divisors.aggregate, allocateAggregate);
    reallocateIfResized(fieldTex, divisors.field, allocateField);
    // `allocateDust` covers dustMapTex AND dustViewTex — they share one
    // divisor (see dustMapTex's declaration comment), and rebuilding one
    // without the other reintroduces the resolution-mismatch bug the
    // divisor-matched contract exists to prevent.
    reallocateIfResized(dustMapTex, divisors.dust, allocateDust);
    reallocateIfResized(hiiTex, divisors.hii, allocateHii);
    // One call per row of `HII_TIERS` rather than one hand-written
    // `reallocateIfResized` line per tier — a fourth tier is a table row, not
    // a fourth line here.
    for (const tier of HII_TIERS) {
      reallocateIfResized(tierTextures.get(tier.kind), divisors.tiers[tier.kind], (w, h) =>
        allocateTier(tier.kind, w, h),
      );
    }
  }

  function rebuildAll(divisors: TargetDivisors): void {
    const w = canvas.width;
    const h = canvas.height;
    if (sceneTex) sceneTex.destroy();
    if (ldrTex) ldrTex.destroy();
    for (const m of bloomMips) m.destroy();
    sceneTex = device.createTexture({
      label: 'galaxy:sceneTex',
      size: [w, h],
      format: formats.hdr,
      usage: RA_TB,
    });
    ldrTex = device.createTexture({
      label: 'galaxy:ldrTex',
      size: [w, h],
      format: formats.swap,
      usage: RA_TB,
    });
    // The reduced targets go through the same size comparison as a divisor
    // drag — on boot they are all `undefined`, so it allocates every one.
    setDivisors(divisors);
    // Pyramid: level 0 = half-res, each further level halves again -> ever-wider
    // glow. `Math.floor(size / scale)` clamped to 1 px, matching the runtime's
    // `renderTargets.allocate`.
    bloomMips = Array.from({ length: BLOOM_LEVELS }, (_unused, level) => {
      const scale = bloomScale(level);
      return device.createTexture({
        label: `galaxy:bloomMip${level}`,
        size: [Math.max(1, Math.floor(w / scale)), Math.max(1, Math.floor(h / scale))],
        format: formats.hdr,
        usage: RA_TB,
      });
    });
  }

  return {
    get sceneTex(): GPUTexture {
      return sceneTex;
    },
    get ldrTex(): GPUTexture {
      return ldrTex;
    },
    get aggregateTex(): GPUTexture {
      return aggregateTex;
    },
    get fieldTex(): GPUTexture {
      return fieldTex;
    },
    get dustMapTex(): GPUTexture {
      return dustMapTex;
    },
    get hiiTex(): GPUTexture {
      return hiiTex;
    },
    tierTex(kind: HiiTier): GPUTexture {
      // Non-null: `rebuildAll`'s unconditional first `setDivisors` allocates
      // every row of `HII_TIERS` before any caller can reach this getter,
      // same contract `aggregateTex`'s (unchecked) getter above relies on.
      return tierTextures.get(kind)!;
    },
    get dustViewTex(): GPUTexture {
      return dustViewTex;
    },
    get bloomMips(): readonly GPUTexture[] {
      return bloomMips;
    },

    reducedSize,

    /**
     * Texel size of bloom level `level` — `1 / source-pixel-size` per axis, which
     * is `scale / viewportPx` because every level is a sub-scale of the one
     * viewport. Mirrors the runtime's `bloomSrcTexelSize`, which can't be reused
     * directly: it reads the divisor off a `ReadyFrameContext`'s render-target
     * specs, and this tool has no frame context.
     */
    bloomTexelSize: (level: number): Vec2 => [
      bloomScale(level) / canvas.width,
      bloomScale(level) / canvas.height,
    ],

    rebuildAll,
    setDivisors,

    destroy(): void {
      if (sceneTex) sceneTex.destroy();
      if (ldrTex) ldrTex.destroy();
      if (aggregateTex) aggregateTex.destroy();
      if (fieldTex) fieldTex.destroy();
      if (dustMapTex) dustMapTex.destroy();
      if (hiiTex) hiiTex.destroy();
      for (const tex of tierTextures.values()) tex.destroy();
      if (dustViewTex) dustViewTex.destroy();
      for (const m of bloomMips) m.destroy();
    },
  };
}
