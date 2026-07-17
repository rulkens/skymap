/**
 * focusedFieldStarSphereLayer — unit tests for the close-range sphere gate of
 * a FOCUSED Gaia field star (spec Amendment 2026-07-17, Stage 1.5).
 *
 * The load-bearing gate subtlety this suite pins is the distance SOURCE: the
 * layer must gate on the CAMERA-TO-STAR distance
 * (`|row.positionMpc − ctx.drawCamPos|`), NOT `ctx.cam.distance` (the orbit
 * distance from the render origin). A field star sits parsecs from the Sun, so
 * the origin distance is irrelevant — only the star's own apparent sphere size
 * decides whether the descent has reached resolving range. We prove it by
 * placing the star parsecs from the origin and moving ONLY the camera: the same
 * row enables when the camera is half an AU off the star and disables when the
 * camera is a kpc away, even though `ctx.cam.distance` is identical in both
 * (the fixtures keep the camera the same distance from the origin — see the
 * fixtures below). A non-`star` row (or none) and a null renderer disable
 * regardless, mirroring `near0SelectionRingLayer` / `starSpheresLayer`.
 */

import { describe, it, expect, vi } from 'vitest';

import { focusedFieldStarSphereLayer } from '../../../../../src/services/engine/frame/passes/focusedFieldStarSphereLayer';
import { SOLAR_RADIUS_KM } from '../../../../../src/data/bodies/solarRadiusKm';
import { SCALE_UNITS } from '../../../../../src/data/scaleUnits';
import type { EngineState } from '../../../../../src/@types/engine/state/EngineState';
import type { ReadyFrameContext } from '../../../../../src/@types/engine/frame/ReadyFrameContext';
import type { SelectionRow } from '../../../../../src/@types/engine/SelectionRow';
import type { GalaxyRow } from '../../../../../src/@types/engine/GalaxyRow';
import type { Vec3 } from '../../../../../src/@types/math/Vec3';
import { Source } from '../../../../../src/data/sources';

// A picked field star parsecs from the render origin (its true habitat). Its
// physical size is the nominal solar radius the extractor stamps (Task 8b).
const STAR_POS: Vec3 = [0.4, -0.3, 0.5]; // ~0.7 Mpc from origin — far from the Sun
const STAR_ROW: SelectionRow = {
  type: 'star',
  index: 7,
  positionMpc: STAR_POS,
  absMag: 4.8,
  bpRp: 0.65,
  radiusKm: SOLAR_RADIUS_KM,
};

// A galaxy row — a non-`star` arm; the sphere layer must ignore it.
const GALAXY_ROW: SelectionRow = {
  type: 'galaxyCatalog',
  source: Source.Glade,
  index: 0,
  objId: '1',
  x: 0,
  y: 0,
  z: 100,
  redshift: 0,
  magU: 0,
  magG: 0,
  magR: 0,
  magI: 0,
  magZ: 0,
  diameterKpc: 60,
  axisRatio: 1,
  positionAngleDeg: 0,
  classByte: 0,
  parentSurveyByte: 0,
} as GalaxyRow;

/**
 * A ctx exposing exactly the gate's reads: the absolute camera position
 * (`drawCamPos`, from which camera-to-star distance is measured), the vertical
 * fov, and the viewport height. 60° fov + 720-px viewport matches the sibling
 * fixtures. `cam.distance` is set to a FIXED sentinel across both the close and
 * far cases so a gate that (wrongly) read it could not tell them apart — only
 * the camera-to-star distance separates them.
 */
function makeCtx(camPos: Vec3): ReadyFrameContext {
  return {
    cam: { distance: 999 },
    drawCamPos: camPos,
    fovYRad: Math.PI / 3,
    canvasSize: { width: 1280, height: 720 },
  } as unknown as ReadyFrameContext;
}

/** A camera half an AU from a position — a solar sphere there clears STAR_RESOLVE_PX. */
function halfAuFrom(positionMpc: Vec3): Vec3 {
  return [positionMpc[0] + 0.5 * SCALE_UNITS.AU_TO_MPC, positionMpc[1], positionMpc[2]];
}

/** A camera a kiloparsec from a position — a solar sphere there is deep sub-pixel. */
function kpcFrom(positionMpc: Vec3): Vec3 {
  return [positionMpc[0] + SCALE_UNITS.KPC_TO_MPC, positionMpc[1], positionMpc[2]];
}

function stateWith(
  row: SelectionRow | null,
  starRenderer: unknown = { draw: vi.fn() },
): EngineState {
  return {
    gpu: { starRenderer },
    selectionRows: { select: row, focus: null, hover: null },
  } as unknown as EngineState;
}

describe('focusedFieldStarSphereLayer.enabled', () => {
  it('enables only for a star row within sphere-resolve range', () => {
    // A star row with the camera half an AU off it: the sphere clears
    // STAR_RESOLVE_PX at the camera-to-star distance → enabled.
    expect(
      focusedFieldStarSphereLayer.enabled(stateWith(STAR_ROW), makeCtx(halfAuFrom(STAR_POS))),
    ).toBe(true);

    // The SAME row with the camera a kpc off the star: the sphere is deep
    // sub-pixel → disabled. `cam.distance` is unchanged from the close case
    // (both 999), so this can only flip on the camera-to-star distance — the
    // gate subtlety the spec calls out.
    expect(
      focusedFieldStarSphereLayer.enabled(stateWith(STAR_ROW), makeCtx(kpcFrom(STAR_POS))),
    ).toBe(false);
  });

  it('is false for a non-star row and for no selection', () => {
    expect(
      focusedFieldStarSphereLayer.enabled(stateWith(GALAXY_ROW), makeCtx(halfAuFrom(STAR_POS))),
    ).toBe(false);
    expect(
      focusedFieldStarSphereLayer.enabled(stateWith(null), makeCtx(halfAuFrom(STAR_POS))),
    ).toBe(false);
  });

  it('is false while the starRenderer is null (pre-bootstrap), even for a resolvable star', () => {
    // Handle first: a null renderer disables before any ctx / row read, so a
    // bare ctx never trips it (renderFrame fixtures carry null handles).
    expect(
      focusedFieldStarSphereLayer.enabled(
        stateWith(STAR_ROW, null),
        {} as unknown as ReadyFrameContext,
      ),
    ).toBe(false);
  });
});
