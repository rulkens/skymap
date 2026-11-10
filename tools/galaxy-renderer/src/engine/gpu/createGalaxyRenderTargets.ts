/**
 * createGalaxyRenderTargets — every offscreen whose size follows the canvas.
 * The runtime keeps its equivalents in a `renderTargets` table carrying volume
 * / foreground rows this tool never draws, so the tool allocates its own `hdr`,
 * `mw-aggregate` and `bloom0..4` rows at the same formats and divisors.
 * `ldrTex` has no runtime counterpart: it is only the intermediate the
 * tool-only grade trailer reads. Each field target's view is made once per
 * allocation: the field module's bind-group cache keys on view identity.
 */
import type { FieldRow } from '../../../@types/engine/FieldRow';
import type { FieldRowKey } from '../../../@types/engine/FieldRowKey';
import type { FieldTargetId } from '../../../../../src/layers/milkyWay/field/@types/FieldTargetId';
import type { GalaxyFieldRenderTargets } from '../../../../../src/layers/milkyWay/field/@types/GalaxyFieldRenderTargets';
import type { HiiTier } from '../../../../../src/layers/milkyWay/field/starFormation/@types/HiiTier';
import type { Vec2 } from '../../../../../src/@types/math/Vec2';

import { BLOOM_LEVELS, bloomScale } from '../../../../../src/data/bloomConstants';
import { mapHiiTiers } from '../../../../../src/layers/milkyWay/field/starFormation/data/hiiTiers';
import { FIELD_TARGET_IDS } from '../../../../../src/layers/milkyWay/field/data/fieldTargetIds';
import { reducedTargetSize } from '../../../../../src/utils/gpu/reducedTargetSize';
import type { TargetDivisors } from '../../../@types/engine/TargetDivisors';
import type { GalaxyRenderTargets } from '../../../@types/engine/GalaxyRenderTargets';

export function createGalaxyRenderTargets(
  device: GPUDevice,
  canvas: HTMLCanvasElement,
  formats: {
    readonly hdr: GPUTextureFormat;
    readonly swap: GPUTextureFormat;
    readonly dustMap: GPUTextureFormat;
  },
): GalaxyRenderTargets {
  let sceneTex: GPUTexture;
  let ldrTex: GPUTexture;
  let aggregateTex: GPUTexture;
  /**
   * Every field target, keyed by `FieldTargetId` plus the debug `dustView`:
   * the texture (the probe readbacks copy from it) and the ONE view the field
   * module binds. A reallocation replaces both, which is what tells the
   * module's bind-group cache to rebuild.
   */
  const fieldRows = new Map<FieldRowKey, FieldRow>();
  // Non-null: every reader runs after `rebuildAll` has allocated every row.
  const row = (key: FieldRowKey) => fieldRows.get(key)!;
  let bloomMips: GPUTexture[] = [];
  const RA_TB = GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING;
  const COPY_SRC = GPUTextureUsage.COPY_SRC;

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

  function allocateFieldRow(
    key: FieldRowKey,
    label: string,
    w: number,
    h: number,
    format: GPUTextureFormat,
    usage: GPUTextureUsageFlags,
  ): void {
    fieldRows.get(key)?.texture.destroy();
    const texture = device.createTexture({ label, size: [w, h], format, usage });
    fieldRows.set(key, {
      texture,
      target: { view: texture.createView(), sizePx: { width: w, height: h } },
    });
  }

  /**
   * The analytic field's OWN reduced-resolution target, deliberately not the
   * star aggregate: sprites carry point-like detail that a coarse divisor
   * destroys, while the field is a sum of wide Gaussians that survives 5x
   * downsampling. Sharing one target made the FILL-bound field pay the
   * sprites' pixel rate. COPY_SRC beyond production need: the probe's
   * `requestArmCloudRenderedFluxSum`/`requestArmSpurCloudRenderedFluxSum` draw
   * an isolated instance range here and read it back.
   */
  function allocateField(w: number, h: number): void {
    allocateFieldRow('field', 'galaxy:fieldTex', w, h, formats.hdr, RA_TB | COPY_SRC);
  }

  /**
   * The dust-column map (dustMap.wesl, four depth-sliced optical depths) and
   * the JWST view's target (dustPresent.wesl), which reads the map 1:1 — so
   * they rebuild TOGETHER on one divisor, finer than the field's, since thin
   * lanes decimate into beads at the field's resolution. The field's
   * componentEmission samples the map through a linear sampler instead (see
   * field/io.wesl's DUST MAP doc for that trade). COPY_SRC beyond production
   * need: the probe's `requestDustMapChannelSum` reads the whole map back.
   */
  function allocateDust(w: number, h: number): void {
    allocateFieldRow('dustMap', 'galaxy:dustMapTex', w, h, formats.dustMap, RA_TB | COPY_SRC);
    allocateFieldRow('dustView', 'galaxy:dustViewTex', w, h, formats.hdr, RA_TB);
  }

  /**
   * The background extras' HII target, at its own divisor (default 1): a
   * shell sprite is small and bright, and the field's coarser target once
   * collapsed it onto one texel that bloom promoted into a firefly
   * (`docs/research/milky-way/hii-regions.md`).
   */
  function allocateExtras(w: number, h: number): void {
    allocateFieldRow('extras', 'galaxy:hiiTex', w, h, formats.hdr, RA_TB);
  }

  /**
   * One HII sub-tier's target: shells and
   * young stars split off for the same firefly reason as `extras`; DIG, the
   * softest and lowest-frequency content, tolerates a much coarser divisor.
   */
  function allocateTier(kind: HiiTier, w: number, h: number): void {
    allocateFieldRow(kind, `galaxy:hiiTierTex:${kind}`, w, h, formats.hdr, RA_TB);
  }

  function allocateFieldTarget(id: FieldTargetId, w: number, h: number): void {
    if (id === 'field') allocateField(w, h);
    // `allocateDust` covers `dustView` too — see its doc.
    else if (id === 'dustMap') allocateDust(w, h);
    else if (id === 'extras') allocateExtras(w, h);
    else allocateTier(id, w, h);
  }

  /**
   * The ONE allocation path for the reduced targets, keyed on the pixel size
   * already on the live texture rather than on a remembered divisor: the
   * texture is the authoritative record of what it was built at, so a divisor
   * drag and a canvas resize both reduce to the same question, and `rebuildAll`
   * delegates here. Two divisors that floor to the same size — or a resize that
   * floors to the same pixels — genuinely need no reallocation: the surviving
   * view is the same object every bind group already holds.
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
    for (const id of FIELD_TARGET_IDS) {
      reallocateIfResized(fieldRows.get(id)?.texture, divisors[id], (w, h) =>
        allocateFieldTarget(id, w, h),
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
    get fieldTargets(): Required<GalaxyFieldRenderTargets> {
      return {
        field: row('field').target,
        dustMap: row('dustMap').target,
        extras: row('extras').target,
        ...mapHiiTiers((kind) => row(kind).target),
        dustView: row('dustView').target,
      };
    },
    get fieldTex(): GPUTexture {
      return row('field').texture;
    },
    get dustMapTex(): GPUTexture {
      return row('dustMap').texture;
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
      for (const { texture } of fieldRows.values()) texture.destroy();
      for (const m of bloomMips) m.destroy();
    },
  };
}
