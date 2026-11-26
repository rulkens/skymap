/**
 * renderFrame — the per-frame command-encoder dispatcher: encoder lifecycle and
 * ordering, the HDR attachment coming from the render-target table, and the
 * hdr→swap composite running after `pass.end`. The device, encoder, pass and every
 * renderer are mocked (`makeRenderFrameFixture`), so nothing here needs a real
 * WebGPU context.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ToneMapCurve } from '../../../../src/data/toneMapCurve';
import { renderFrame } from '../../../../src/services/engine/frame/renderFrame';
import { deriveView } from '../../../../src/services/engine/frame/deriveView';
import { faceViewSpec } from '../../../../src/utils/camera/viewRig/faceViewSpec';
import { expandFrameOrder } from '../../../../src/services/engine/frame/expandFrameOrder';
import { FRAME_ORDER } from '../../../../src/services/engine/frame/frameOrder';
import { VIEW_RIGS } from '../../../../src/data/rendering/viewRigs';
import { foregroundChainOrder } from '../../../../src/services/engine/frame/slabs';
import { bodyRowSlabs } from '../../../../src/services/engine/frame/bodyRowSlabs';
import { INITIAL_SETTINGS } from '../../../../src/state/settings/initialSettings';
import { makeCosmoSlab } from '../../../fixtures/makeCosmoSlab';
import { makeSlab } from '../../../fixtures/makeSlab';
import { makeRenderFrameFixture } from '../../../helpers/frame/makeRenderFrameFixture';
import type { FrameView } from '../../../../src/@types/engine/frame/FrameView';

describe('renderFrame', () => {
  let fx: ReturnType<typeof makeRenderFrameFixture>;

  beforeEach(() => {
    fx = makeRenderFrameFixture();
  });

  it('creates exactly one command encoder on a frame with no capture faces', () => {
    // Mono's rig hands every section the same view (`ctx` itself), so
    // PRELUDE/SCENE/POST/OVERLAYS all accumulate into the one running batch —
    // one encoder for the whole frame.
    renderFrame(fx.input);
    expect(fx.createCommandEncoder).toHaveBeenCalledTimes(1);
  });

  it('submits exactly once, with the encoder.finish() output, on a frame with no capture faces', () => {
    renderFrame(fx.input);
    expect(fx.submit).toHaveBeenCalledTimes(1);
    expect(fx.finish).toHaveBeenCalledTimes(1);
    const submitted = fx.submit.mock.calls[0]![0];
    expect(submitted).toHaveLength(1);
    expect(submitted[0]).toBe(fx.finish.mock.results[0]!.value);
  });

  it("begins the HDR render pass with the target table's hdr view as the colour attachment", () => {
    // No-timing 'merged' strategy opens four passes: (hdr, COSMO) clear (the one pinned here), the
    // (mw-aggregate, NEAR0) cloud star pass, the (hdr, NEAR0) dust pass, and the hdr→swap composite.
    renderFrame(fx.input);
    const calls = fx.beginRenderPass.mock.calls;
    expect(calls).toHaveLength(4);

    const desc = calls[0]![0];
    const attachments = Array.from(desc.colorAttachments as any);
    expect(attachments).toHaveLength(1);
    const att = attachments[0] as any;
    expect(att.view).toBe(fx.renderTargetViews.hdr);
    expect(att.loadOp).toBe('clear');
    expect(att.storeOp).toBe('store');
    expect(att.clearValue).toEqual({ r: 0, g: 0, b: 0, a: 1 });
  });

  it('forwards every settings field to galaxyPointRenderer.draw in the canonical order', () => {
    renderFrame(fx.input);
    const draw = fx.galaxyPointRenderer.draw;
    expect(draw).toHaveBeenCalledTimes(1);
    const args = draw.mock.calls[0]!;
    expect(args[0]).toBe(fx.pass);
    // args[1] is the resolved SlabView's `vp` — a fresh Float32Array
    // narrowed from the cosmological slab's Float64Array row by
    // `slabViewOf` (see `slabs.ts`), not the identical `fx.vp`
    // reference the ctx fixture was built from. Value equality is the
    // right check post-unification.
    expect(args[1]).toEqual(fx.vp);
    expect(args[2]).toEqual([fx.canvasSize.width, fx.canvasSize.height]);
    const drawSettings = args[3] as Record<string, unknown>;
    const { galaxyCatalogs, bias } = fx.input.state.settings;
    expect(drawSettings.pointSizePx).toBe(galaxyCatalogs.sizePx);
    expect(drawSettings.brightness).toBe(galaxyCatalogs.brightness);
    expect(drawSettings.selectedPacked).toBe(0xffffffff >>> 0);
    expect(Array.from(drawSettings.camPosWorld as ArrayLike<number>)).toEqual(
      Array.from(fx.cam.position),
    );
    // pxPerRad = h / (2 · tan(fovY/2))
    const expectedPxPerRad = fx.canvasSize.height / (2 * Math.tan(fx.cam.fovYRad / 2));
    expect(drawSettings.pxPerRad as number).toBeCloseTo(expectedPxPerRad, 6);
    expect(drawSettings.provenance).toEqual(galaxyCatalogs.provenance);
    expect(drawSettings.biasMode).toBe(bias.mode);
    expect(drawSettings.absMagLimit).toBe(bias.absMagLimit);
    expect(drawSettings.depthFadeEnabled).toBe(galaxyCatalogs.depthFade);
  });

  it("runs the hdr→swap composite after the HDR pass with blend 'replace' and the settings tone", () => {
    renderFrame(fx.input);
    const idxEnd = fx.log.indexOf('pass.end');
    const idxComposite = fx.log.indexOf('compositor.draw');
    expect(idxEnd).toBeGreaterThanOrEqual(0);
    expect(idxComposite).toBeGreaterThan(idxEnd);

    expect(fx.compositor.draw).toHaveBeenCalledTimes(1);
    const args = fx.compositor.draw.mock.calls[0]!;
    expect(args[1]).toBe(fx.renderTargetViews.hdr);
    expect(args[2]).toBe('replace');
    const { tonemap } = fx.input.state.settings;
    expect(args[3]).toEqual({
      exposure: tonemap.exposure,
      curve: tonemap.curve,
      hdrKnee: 0,
      hdrHeadroom: 0,
      film: null,
    });
  });

  it('forwards the settings headroom knobs only when the swap chain is extended-range', () => {
    // The two knobs are live settings but must reach the shader as 0 on an SDR
    // swap chain, where spilled energy would just be clamped back to white. The
    // gate lives in renderFrame via `hdrActiveOf`, which reads the `swap` row's
    // format straight off `renderTargets.specs` — flipping it to the extended-range
    // format is the whole difference between the settings values and zeros.
    fx.renderTargets.specOf('swap').format = 'rgba16float';
    renderFrame(fx.input);

    const tone = fx.compositor.draw.mock.calls[0]![3] as { hdrKnee: number; hdrHeadroom: number };
    expect(tone.hdrKnee).toBe(4);
    expect(tone.hdrHeadroom).toBe(0.25);
  });

  it('the tone-map gets zero headroom when the HDR toggle is off even on a float swap chain', () => {
    // A float swap chain alone isn't sufficient: the format switch and the
    // `hdr.enabled` write land in separate frames, so a frame can carry an
    // extended-range swap chain with the viewer's toggle still off. Gating
    // on `hdrActive` alone would leak the settings knobs into that frame.
    const fx2 = makeRenderFrameFixture({
      settings: { hdr: { enabled: false, knee: 4, headroom: 0.25 } },
    });
    fx2.renderTargets.specOf('swap').format = 'rgba16float';
    renderFrame(fx2.input);

    const tone = fx2.compositor.draw.mock.calls[0]![3] as { hdrKnee: number; hdrHeadroom: number };
    expect(tone.hdrKnee).toBe(0);
    expect(tone.hdrHeadroom).toBe(0);
  });

  it("the tone-map's film is null while the look is off and carries the grade and the frame index when on", () => {
    type Tone = { film: { grade: unknown; seed: number } | null };
    const toneOf = (draw: typeof fx.compositor.draw, call: number) =>
      draw.mock.calls[call]![3] as Tone;
    renderFrame(fx.input);
    expect(toneOf(fx.compositor.draw, 0).film).toBeNull();

    const on = makeRenderFrameFixture({
      settings: { film: { ...INITIAL_SETTINGS.film, enabled: true } },
    });
    renderFrame(on.input);
    renderFrame(on.input);
    const [first, second] = [
      toneOf(on.compositor.draw, 0).film!,
      toneOf(on.compositor.draw, 1).film!,
    ];
    expect(first.grade).toBe(INITIAL_SETTINGS.film.grade);
    expect(second.seed - first.seed).toBe(1);
  });

  describe('letterbox', () => {
    // A fake renderer stands in for the swap-format pipeline the fixture leaves null.
    function filmFixture(film: Partial<typeof INITIAL_SETTINGS.film>) {
      const fx2 = makeRenderFrameFixture({
        settings: { film: { ...INITIAL_SETTINGS.film, ...film } },
      });
      const letterboxRenderer = { draw: vi.fn(), destroy: vi.fn(), label: 'letterboxRenderer' };
      (fx2.input.state.gpu as { letterboxRenderer: unknown }).letterboxRenderer = letterboxRenderer;
      return { fx2, letterboxRenderer };
    }

    it("draws the bars as the frame's last pass, on swap, at the target size", () => {
      const { fx2, letterboxRenderer } = filmFixture({ enabled: true, letterbox: true });
      renderFrame(fx2.input);
      const calls = fx2.beginRenderPass.mock.calls;
      expect(calls).toHaveLength(5);
      const last = calls.at(-1)![0];
      expect(last.label).toBe('render-swap');
      expect(Array.from(last.colorAttachments)[0]!.view).toEqual({ __id: 'swap-view' });
      expect(letterboxRenderer.draw).toHaveBeenCalledWith(
        fx2.pass,
        fx2.canvasSize,
        INITIAL_SETTINGS.film.letterboxAspect,
      );
    });

    it('opens no pass while the letterbox or the look is off', () => {
      for (const film of [
        { enabled: true, letterbox: false },
        { enabled: false, letterbox: true },
      ]) {
        const { fx2, letterboxRenderer } = filmFixture(film);
        renderFrame(fx2.input);
        expect(fx2.beginRenderPass.mock.calls).toHaveLength(4);
        expect(letterboxRenderer.draw).not.toHaveBeenCalled();
      }
    });
  });

  it('records the full frame in canonical order: createEncoder → hdr COSMO pass (points) → mw-aggregate pass (cloud stars) → hdr NEAR0 pass (cloud dust) → composite pass → compositor.draw → finish → submit', () => {
    // No-timing 'merged' path: the four passes of the first test (the cloud's dust draws in the
    // cloud's own slab since the fixed COSMO near plane clipped its disc mid-descent), then finish + submit.
    renderFrame(fx.input);
    expect(fx.log).toEqual([
      'device.createCommandEncoder',
      'encoder.beginRenderPass',
      'galaxyPointRenderer.draw',
      'pass.end',
      'encoder.beginRenderPass',
      'milkyWayCloudRenderer.drawStars',
      'pass.end',
      'encoder.beginRenderPass',
      'milkyWayCloudRenderer.drawDust',
      'pass.end',
      'encoder.beginRenderPass',
      'compositor.draw',
      'pass.end',
      'encoder.finish',
      'device.queue.submit',
    ]);
  });

  it('encodes no foreground pass or composite while the foreground handles are null', () => {
    // With the body/star renderers and labelRendererNear null, the near-field steps select only the
    // cloud's dust + upsample rows and foreground:0 is never touched, so its →swap composite is
    // skipped: exactly four passes (hdr COSMO, mw-aggregate, hdr NEAR0, hdr→swap), one compositor draw.
    renderFrame(fx.input);
    const calls = fx.beginRenderPass.mock.calls;
    expect(calls).toHaveLength(4);
    for (const [desc] of calls) {
      expect((desc as any).label).not.toContain('foreground:0');
    }
    expect(fx.compositor.draw).toHaveBeenCalledTimes(1);
    expect(fx.compositor.draw.mock.calls[0]![2]).toBe('replace');
  });

  it('opens the density pass before the hdr pass when the density layer is live', () => {
    // The density render step precedes the hdr step, so with non-null density liveness the density
    // pass is the FIRST beginRenderPass.
    const drawSpy = vi.fn();
    // Mutated in place: the raymarch row captured this renderer at construction.
    Object.assign(fx.densityRuntime.renderer, { draw: drawSpy, hasActiveFields: () => true });
    const reducedResView = { __id: 'reduced-res' } as unknown as GPUTextureView;
    fx.renderTargetViews['cosmic-web-density'] = reducedResView;

    renderFrame(fx.input);

    const calls = fx.beginRenderPass.mock.calls;
    expect(calls.length).toBeGreaterThanOrEqual(4); // density + hdr + mw-aggregate + composite
    const firstAtt = Array.from(calls[0]![0].colorAttachments as any)[0] as any;
    expect(firstAtt.view).toBe(reducedResView);
    expect(firstAtt.loadOp).toBe('clear');
    expect(firstAtt.clearValue).toEqual({ r: 0, g: 0, b: 0, a: 0 });

    expect(drawSpy).toHaveBeenCalledTimes(1);
  });

  it('skips the density pass and hides its upsample when no field is live', () => {
    // Default fixture: no active field → liveness null → BOTH the density
    // producer and the upsample consumer gate off the same fact, so they
    // cannot disagree. Only the hdr + composite passes open.
    renderFrame(fx.input);
    expect(fx.beginRenderPass.mock.calls).toHaveLength(4);
    expect(fx.densityRuntime.upsample.draw).not.toHaveBeenCalled();
  });

  it('skips a pass whose name appears in settings.debug.disabledPasses', () => {
    // The DebugPanel flips entries in/out of `settings.debug.disabledPasses`.
    // The executor's render-step group filter checks the record after each
    // layer's own `enabled()` gate, so mapping `point-sprites` to true stops
    // `galaxyPointRenderer.draw` even though every other input would run it.
    const fx2 = makeRenderFrameFixture({
      settings: { debug: { ...INITIAL_SETTINGS.debug, disabledPasses: { 'point-sprites': true } } },
    });
    renderFrame(fx2.input);
    expect(fx2.galaxyPointRenderer.draw).not.toHaveBeenCalled();
    // Milky-way still draws — the override is per-pass, not global — and both
    // halves of the cloud (its own aggregate pass, its dust pass in HDR) run.
    expect(fx2.milkyWayCloudRenderer.drawStars).toHaveBeenCalledTimes(1);
    expect(fx2.milkyWayCloudRenderer.drawDust).toHaveBeenCalledTimes(1);
  });

  it('does not skip a pass whose name maps to false in disabledPasses', () => {
    // `[name] === false` means enabled — only `=== true` hides a pass.
    const fx2 = makeRenderFrameFixture({
      settings: {
        debug: { ...INITIAL_SETTINGS.debug, disabledPasses: { 'point-sprites': false } },
      },
    });
    renderFrame(fx2.input);
    expect(fx2.galaxyPointRenderer.draw).toHaveBeenCalledTimes(1);
  });

  it('mono rig submits the same step list as FRAME_ORDER', () => {
    // The rig split must expand to exactly the same steps whether walked as
    // one flat list or as four sections concatenated — and VIEW_RIGS.mono IS
    // those four sections, against the main ctx alone.
    const options = {
      tone: { exposure: 1, curve: ToneMapCurve.Reinhard, hdrKnee: 0, hdrHeadroom: 0, film: null },
      bloomEnabled: false,
      foregroundChain: foregroundChainOrder(fx.input.canvas.slabs),
      captureFaces: new Map(),
      bodyRowSlabs: bodyRowSlabs(fx.input.canvas),
    };
    const passes = (fx.input.state as any).passes;
    const whole = expandFrameOrder(FRAME_ORDER, passes, options);
    const bySections = VIEW_RIGS.mono.program.flatMap((section) =>
      expandFrameOrder(section.steps, passes, options),
    );
    expect(bySections).toEqual(whole);
    // mono returns null, never its own spec — see `ViewRig.views`'s doc: a
    // spec would derive the canvas view a second time and split the submit.
    expect(VIEW_RIGS.mono.views(fx.input.canvas, fx.input.state as any)).toBeNull();
  });

  it('a registered rig returning two specs yields two views sharing the frame snapshot', () => {
    // The shared-snapshot invariant is structural: `ViewSpec`s carry no
    // snapshot of their own, so a rig's specs, derived exactly as `runFrame`
    // derives them (`rig.views(canvas, state)` → `deriveView` per spec), can
    // only ever produce views of THIS canvas's snapshot.
    (VIEW_RIGS as any).__snapshotIdentityTest = {
      views: () => [faceViewSpec('probe', 0, 64, 0), faceViewSpec('probe', 1, 64, 1)],
      program: [],
    };
    (fx.input.state as any).viewRig = '__snapshotIdentityTest';
    try {
      const specs = (VIEW_RIGS as any).__snapshotIdentityTest.views(
        fx.input.canvas,
        fx.input.state,
      );
      const views = specs.map((spec: any) => deriveView(fx.input.canvas.snapshot, fx.cam, spec));
      renderFrame({ ...fx.input, views } as any);
      expect(views[0].snapshot).toBe(fx.input.canvas.snapshot);
      expect(views[1].snapshot).toBe(fx.input.canvas.snapshot);
    } finally {
      delete (VIEW_RIGS as any).__snapshotIdentityTest;
    }
  });

  it('a perView section with two views submits twice, each expanded from its own view', () => {
    const stubPass = { name: 'stub-foreground', enabled: () => true, draw: vi.fn() };
    (fx.input.state as any).passes = [...(fx.input.state as any).passes, stubPass];

    // view1's chain is NEAR0 alone (one foreground step); view2 adds a
    // body-m row (a second, distinct-slab step) — the counts must track
    // each view's OWN slabs, not the main ctx's.
    const near0Slab = makeSlab();
    const bodySlab = makeSlab({ index: 2, frame: { kind: 'body-m', hostId: 'earth' as any } });
    const view1 = { ...fx.input.canvas, slabs: [near0Slab] };
    const view2 = { ...fx.input.canvas, slabs: [near0Slab, makeCosmoSlab(), bodySlab] };

    (VIEW_RIGS as any).__twoViewsTest = {
      views: () => [],
      program: [
        {
          scope: 'perView',
          steps: [
            {
              kind: 'foreground',
              target: 'hdr',
              near0Passes: ['stub-foreground'],
              bodyPasses: ['stub-foreground'],
            },
          ],
        },
      ],
    };
    (fx.input.state as any).viewRig = '__twoViewsTest';

    try {
      renderFrame({ ...fx.input, views: [view1, view2] } as any);
    } finally {
      delete (VIEW_RIGS as any).__twoViewsTest;
    }

    expect(fx.submit).toHaveBeenCalledTimes(2);
    expect(fx.beginRenderPass.mock.calls).toHaveLength(3);
  });

  it('a once section sees the frame-wide content fact across views, while each view still clears its own first touch (radar K4)', () => {
    // A `once` section against `canvas` sees what a DIFFERENT view's
    // `perView` section drew: the content question is frame-wide
    // (`ctx.snapshot.renderedTargets`), read here through a stub overlay
    // pass, while the executor's per-call `touched` set — which decides
    // clear-vs-load — stays private: view B's own first touch of `hdr`
    // still CLEARS, even though view A already drew into it moments
    // earlier in the same frame.
    const stubHdrPass = { name: 'stub-hdr', enabled: () => true, draw: vi.fn() };
    const seenContentFact: boolean[] = [];
    const overlayPass = {
      name: 'stub-overlay',
      enabled: () => true,
      draw: vi.fn((_pass: unknown, _view: unknown, ctx: FrameView) => {
        seenContentFact.push(ctx.snapshot.renderedTargets.has('hdr'));
      }),
    };
    (fx.input.state as any).passes = [...(fx.input.state as any).passes, stubHdrPass, overlayPass];

    // Neither view is `canvas` — the fact must be visible to canvas's `once`
    // section without being tied to `canvas === views[0]`.
    const viewA = { ...fx.input.canvas, viewSlot: 1, slabs: [makeSlab()] };
    const viewB = { ...fx.input.canvas, viewSlot: 2, slabs: [makeSlab()] };

    (VIEW_RIGS as any).__foldTest = {
      views: () => [],
      program: [
        {
          scope: 'perView',
          steps: [{ kind: 'render', target: 'hdr', slab: 0, passes: ['stub-hdr'] }],
        },
        {
          scope: 'once',
          steps: [{ kind: 'render', target: 'swap', slab: 0, passes: ['stub-overlay'] }],
        },
      ],
    };
    (fx.input.state as any).viewRig = '__foldTest';

    try {
      renderFrame({ ...fx.input, views: [viewA, viewB] } as any);
    } finally {
      delete (VIEW_RIGS as any).__foldTest;
    }

    expect(seenContentFact).toEqual([true]);

    const hdrAttachments = fx.beginRenderPass.mock.calls
      .map(([desc]) => Array.from(desc.colorAttachments)[0]!)
      .filter((attachment) => attachment.view === fx.renderTargetViews.hdr);
    expect(hdrAttachments.map((attachment) => attachment.loadOp)).toEqual(['clear', 'clear']);
  });
});
