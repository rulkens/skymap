/**
 * spaceMouseReport — pure parser for raw 3Dconnexion HID reports.
 *
 * ### What is an HID report?
 *
 * Human Interface Devices speak in fixed-layout byte buffers called
 * "reports". The kernel hands one to the browser whenever the device sends
 * data; in WebHID this lands as the `data` DataView on an `inputreport`
 * event. Each device defines its own per-report layout — for SpaceMouse,
 * the layout is well-documented from years of community reverse-engineering.
 *
 * ### SpaceMouse layout (the one we care about)
 *
 *   Report ID 1, 6 bytes:  tx, ty, tz   (3 × int16 LE)
 *   Report ID 2, 6 bytes:  rx, ry, rz   (3 × int16 LE)
 *
 * Some newer devices (SpaceMouse Wireless v2, Compact post-2020) instead
 * send a single Report ID 1 with 12 bytes containing all six axes. The
 * dispatcher in `spaceMouse.ts` checks `data.byteLength` and routes to the
 * right parser; this file just provides the three pure decoders.
 *
 * ### Why int16 little-endian?
 *
 * All 3Dconnexion devices use signed 16-bit values so the sign bit
 * naturally encodes "push left" vs. "push right". Little-endian is the
 * choice for the firmware (and matches every desktop CPU we run on);
 * we pass `littleEndian = true` to `getInt16` to be explicit and
 * portable to a hypothetical big-endian browser.
 *
 * ### Why divide by 350, not 32767?
 *
 * The signed-16-bit range is [-32768, +32767], but the firmware caps the
 * deflection scaling around ±350 at full physical deflection of the puck.
 * Higher values are unreachable without modifying the hardware. Normalising
 * by 350 (then clamping) gives us [-1, +1] over the *usable* range — far
 * better resolution for the cube curve in `spaceMouseSensitivity.ts` than
 * dividing by 32767 would (which would compress real input into a tiny
 * sliver near zero). Empirically 350 is what every reference driver uses;
 * see e.g. the spnav Linux daemon and Blender's input plugin.
 */

import type { SpaceMouseAxes } from '../../@types/input/SpaceMouseAxes';

/**
 * The maximum raw value we expect at full physical deflection.
 *
 * Firmware caps deflection scaling near this — values above will be clamped
 * by `normalise`, but in practice the device will never emit them.
 */
const MAX_DEFLECTION = 350;

/**
 * Normalise a raw int16 reading into the [-1, +1] range, clamping anything
 * out-of-range to the edges. Called for every axis from every parser.
 */
function normalise(rawInt16: number): number {
  const v = rawInt16 / MAX_DEFLECTION;
  // Clamp explicitly — a damaged or non-conforming device could in theory
  // emit values above ±350, and we never want to feed >1 to the cube curve
  // (which would amplify garbage into runaway camera motion).
  if (v > 1) return 1;
  if (v < -1) return -1;
  return v;
}

/**
 * Parse a 6-byte translation report (Report ID 1 in the split-report layout).
 *
 * Offsets 0/2/4 → tx/ty/tz, each int16 little-endian. The parser tolerates
 * a longer-than-6 buffer (some implementations include trailing padding) by
 * ignoring anything past offset 4.
 *
 * @throws RangeError if the buffer is shorter than 6 bytes.
 */
export function parseTranslationReport(data: DataView): {
  tx: number;
  ty: number;
  tz: number;
} {
  return {
    tx: normalise(data.getInt16(0, true)),
    ty: normalise(data.getInt16(2, true)),
    tz: normalise(data.getInt16(4, true)),
  };
}

/**
 * Parse a 6-byte rotation report (Report ID 2 in the split-report layout).
 *
 * Same byte layout as the translation report, just decoded into rx/ry/rz.
 *
 * @throws RangeError if the buffer is shorter than 6 bytes.
 */
export function parseRotationReport(data: DataView): {
  rx: number;
  ry: number;
  rz: number;
} {
  return {
    rx: normalise(data.getInt16(0, true)),
    ry: normalise(data.getInt16(2, true)),
    rz: normalise(data.getInt16(4, true)),
  };
}

/**
 * Parse a 12-byte combined report (Report ID 1 on newer "all-in-one" firmwares).
 *
 * Layout: tx, ty, tz, rx, ry, rz at offsets 0/2/4/6/8/10. Same int16 LE encoding.
 *
 * @throws RangeError if the buffer is shorter than 12 bytes.
 */
export function parseCombinedReport(data: DataView): SpaceMouseAxes {
  return {
    tx: normalise(data.getInt16(0, true)),
    ty: normalise(data.getInt16(2, true)),
    tz: normalise(data.getInt16(4, true)),
    rx: normalise(data.getInt16(6, true)),
    ry: normalise(data.getInt16(8, true)),
    rz: normalise(data.getInt16(10, true)),
  };
}
