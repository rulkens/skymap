/**
 * Field-by-field parse of the stored camera-controls cluster: a bad field (a
 * hand-edited or older entry) falls back to its default alone, so one wrong
 * toggle never resets the user's scheme or friction.
 */
import { DEFAULT_CAMERA_CONTROLS } from '../../data/camera/openSpaceNavigation';
import type { CameraControlsSettings } from '../../@types/settings/CameraControlsSettings';
import type { ControlSchemeId } from '../../@types/engine/camera/ControlSchemeId';
import type { FrictionGroup } from '../../@types/camera/FrictionGroup';

// A Record, so a new scheme id fails to compile here until it is accepted.
const SCHEME_IDS: Readonly<Record<ControlSchemeId, true>> = { skymap: true, openspace: true };

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

export function parseCameraControls(raw: string): CameraControlsSettings | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(parsed)) return null;

  const { scheme, friction, frictionOn } = parsed;
  const storedOn = isRecord(frictionOn) ? frictionOn : {};
  const defaults = DEFAULT_CAMERA_CONTROLS;
  const groups = Object.keys(defaults.frictionOn) as FrictionGroup[];

  return {
    scheme:
      typeof scheme === 'string' && Object.hasOwn(SCHEME_IDS, scheme)
        ? (scheme as ControlSchemeId)
        : defaults.scheme,
    friction:
      typeof friction === 'number' && friction >= 0 && friction <= 1 ? friction : defaults.friction,
    frictionOn: Object.fromEntries(
      groups.map((g) => {
        const on = storedOn[g];
        return [g, typeof on === 'boolean' ? on : defaults.frictionOn[g]];
      }),
    ) as Record<FrictionGroup, boolean>,
  };
}
