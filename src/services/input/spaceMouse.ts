/**
 * spaceMouse — WebHID glue layer for 3Dconnexion SpaceMouse devices.
 *
 * ### Why WebHID, not WebUSB or gamepad?
 *
 * 3Dconnexion devices identify as standard HID, so the OS already speaks
 * to them — WebHID lets us read those reports directly without a vendor
 * driver. WebUSB would require the browser to claim the interface (which
 * would steal it from the OS-level driver, breaking other apps), and the
 * Gamepad API doesn't surface HID reports — only canonical button/axis
 * mappings that don't include the SpaceMouse's 6DOF axes.
 *
 * ### Browser support
 *
 *   - Chromium (Chrome, Edge, Opera, Brave) on desktop: ✓
 *   - Firefox: ✗ (rejected the WebHID standard for security/privacy reasons)
 *   - Safari: ✗ (no public roadmap)
 *
 * `isWebHIDSupported()` is the canonical feature check; the settings panel
 * uses it to gate the entire SpaceMouse section so users on unsupported
 * browsers see no UI for an inaccessible feature.
 *
 * ### Pairing flow
 *
 * On first connect, `requestDevice` MUST be called from a real user
 * gesture — Chromium will reject it otherwise (this is a privacy safeguard
 * to prevent silent fingerprinting). After the user pairs once, the
 * permission persists across reloads, so we silently re-acquire on
 * startup via `getDevices()` — no gesture required because the user
 * already granted access. This gives the best UX: pair once, and the
 * SpaceMouse "just works" on every subsequent visit.
 *
 * ### Vendor IDs
 *
 *   - 0x046d → Logitech (older 3Dconnexion devices, pre-2017 SpaceMouse Pro,
 *              SpaceNavigator, etc.)
 *   - 0x256f → 3Dconnexion (post-Logitech, current SpaceMouse Compact /
 *              Wireless / Pro / Enterprise)
 *
 * We accept both in the device filter so users with any era of hardware
 * can pair.
 *
 * ### Lifetime
 *
 * `connect()` and `disconnect()` are idempotent: calling them while in the
 * matching state is a no-op. The class deliberately doesn't try to reopen
 * a closed device or auto-reconnect after physical unplug — the browser's
 * `disconnect` event sets `device = null` and the user can hit Connect
 * again. Keeps the code path simple and predictable.
 */

import type { SpaceMouseAxes } from './spaceMouseAxes';
import { ZERO_AXES } from './spaceMouseAxes';
import {
  parseTranslationReport,
  parseRotationReport,
  parseCombinedReport,
} from './spaceMouseReport';

// ─── Constants ────────────────────────────────────────────────────────────────

/** Old-Logitech vendor ID — covers SpaceNavigator and pre-2017 devices. */
const VENDOR_LOGITECH = 0x046d;
/** Current 3Dconnexion vendor ID — covers all post-2017 devices. */
const VENDOR_3DCONNEXION = 0x256f;

/**
 * The single device filter accepted by `requestDevice`. We don't filter by
 * `productId` because there are dozens across both vendors and we don't
 * want to maintain that list — the puck-style geometry is consistent across
 * the whole product line, so the parser handles them all uniformly.
 */
const DEVICE_FILTERS: HIDDeviceFilter[] = [
  { vendorId: VENDOR_LOGITECH },
  { vendorId: VENDOR_3DCONNEXION },
];

// ─── Feature detection ────────────────────────────────────────────────────────

/**
 * Return `true` if the current browser exposes the WebHID API.
 *
 * Used by the React UI to gate the entire SpaceMouse settings section so
 * users on Firefox/Safari see no broken UI. Cheap to call (one property
 * lookup) — call sites can use it inline in JSX without memoising.
 */
export function isWebHIDSupported(): boolean {
  return typeof navigator !== 'undefined' && 'hid' in navigator;
}

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * Constructor options for `SpaceMouseInput`.
 *
 * `onAxes` is called every time we successfully decode a report — typically
 * 60–100 Hz when the puck is deflected, never when it's at rest (the
 * firmware suppresses zero reports).
 *
 * The callback receives a fresh axes object each call; the implementation
 * may safely retain or mutate it.
 */
export type SpaceMouseInputOptions = {
  /** Called on every decoded report with the latest axes reading. */
  onAxes: (axes: SpaceMouseAxes) => void;
  /**
   * Optional callback fired when the device's connect/disconnect state
   * changes (paired, unpaired, USB unplug, etc.). Useful for the settings
   * panel's "Connected: <product>" status text.
   */
  onConnectionChange?: (connected: boolean, productName: string | null) => void;
};

// ─── SpaceMouseInput class ────────────────────────────────────────────────────

/**
 * Owns the open `HIDDevice` and the `inputreport` listener.
 *
 * Construction is cheap and side-effect-free — the device is opened only
 * after `connect()` (or the silent re-acquisition pass that
 * `tryReacquire()` performs on startup).
 */
export class SpaceMouseInput {
  private device: HIDDevice | null = null;
  private readonly onAxes: (axes: SpaceMouseAxes) => void;
  private readonly onConnectionChange?: (connected: boolean, productName: string | null) => void;

  /**
   * Latest axes by report ID. The two-report layout sends translation and
   * rotation as separate `inputreport` events, so we cache the most recent
   * value of each and emit a combined `SpaceMouseAxes` on every report.
   * This way the camera always sees the freshest data on whichever channel
   * the user is currently moving.
   */
  private latestAxes: SpaceMouseAxes = { ...ZERO_AXES };

  /**
   * Bound listener — saved so we can `removeEventListener` exactly the
   * same function reference on disconnect (anonymous arrows would leak the
   * listener forever).
   */
  private readonly handleInputReport = (event: HIDInputReportEvent): void => {
    const { reportId, data } = event;
    // Translation-only report (the canonical "split layout" Report 1).
    if (reportId === 1 && data.byteLength >= 12) {
      // Combined-report device — Report ID 1 carries all 6 axes in 12 bytes.
      // Detected by buffer length: split-report Report 1 is exactly 6 bytes.
      this.latestAxes = parseCombinedReport(data);
    } else if (reportId === 1) {
      const t = parseTranslationReport(data);
      this.latestAxes = { ...this.latestAxes, tx: t.tx, ty: t.ty, tz: t.tz };
    } else if (reportId === 2) {
      const r = parseRotationReport(data);
      this.latestAxes = { ...this.latestAxes, rx: r.rx, ry: r.ry, rz: r.rz };
    } else {
      // Unknown report ID — buttons (Report 3) or LED state (Report 4+).
      // We ignore these for now; future feature work can decode them.
      return;
    }
    this.onAxes(this.latestAxes);
  };

  constructor(options: SpaceMouseInputOptions) {
    this.onAxes = options.onAxes;
    this.onConnectionChange = options.onConnectionChange;

    // Try to silently re-acquire a previously-paired device. This runs
    // synchronously-ish (the promise resolves quickly when there are no
    // paired devices, instantly returning an empty array). No user gesture
    // is required because permission was granted on a previous visit.
    if (isWebHIDSupported()) {
      this.tryReacquire().catch((err) => {
        // Re-acquisition is best-effort; failing here just means the user
        // will have to click the Connect button again. Don't surface this
        // as an error to the UI — the app continues to work without the
        // SpaceMouse.
        console.warn('[SpaceMouse] Silent re-acquire failed:', err);
      });
    }
  }

  // ── Public API ────────────────────────────────────────────────────────────

  /**
   * Prompt the browser's device-picker UI and open the selected device.
   *
   * MUST be called from a real user gesture (button click, keypress, etc.).
   * Otherwise Chromium rejects the request with a SecurityError. The
   * settings panel's "Connect SpaceMouse" button is the canonical caller.
   *
   * @returns true if a device was opened; false on cancel, error, or no
   *          matching device.
   */
  async connect(): Promise<boolean> {
    if (!isWebHIDSupported()) return false;
    if (this.device) return true; // already connected

    try {
      const devices = await navigator.hid.requestDevice({ filters: DEVICE_FILTERS });
      if (devices.length === 0) return false; // user cancelled the picker
      const device = devices[0];
      if (!device) return false;
      await this.openDevice(device);
      return true;
    } catch (err) {
      console.warn('[SpaceMouse] Connect failed:', err);
      return false;
    }
  }

  /**
   * Close the device and detach the listener.
   *
   * Idempotent — safe to call when no device is open. Always fires
   * `onConnectionChange(false, null)` to let the UI clear its status.
   */
  disconnect(): void {
    if (!this.device) return;
    try {
      this.device.removeEventListener('inputreport', this.handleInputReport);
      // close() returns a promise but we don't await it: the GC will
      // collect the device once references drop, and a hung close
      // shouldn't block the UI. Fire-and-forget is appropriate here.
      void this.device.close();
    } catch (err) {
      console.warn('[SpaceMouse] Disconnect error:', err);
    }
    this.device = null;
    this.onConnectionChange?.(false, null);
  }

  /** Whether a device is currently open and feeding reports. */
  isConnected(): boolean {
    return this.device !== null && this.device.opened;
  }

  /** The product name of the connected device, or null. */
  productName(): string | null {
    return this.device?.productName ?? null;
  }

  // ── Private helpers ──────────────────────────────────────────────────────

  /**
   * Walk all already-paired devices and adopt the first one that matches
   * our vendor filter. Permission was already granted on a previous visit
   * so this needs no user gesture.
   *
   * If the user has never paired a SpaceMouse, `getDevices()` returns an
   * empty array and this is a no-op.
   */
  private async tryReacquire(): Promise<void> {
    const known = await navigator.hid.getDevices();
    const match = known.find(
      (d) => d.vendorId === VENDOR_LOGITECH || d.vendorId === VENDOR_3DCONNEXION,
    );
    if (match) {
      await this.openDevice(match);
    }
  }

  /**
   * Open the given HID device and wire up the input listener. Shared by
   * `connect()` and `tryReacquire()` so opening is in exactly one place.
   */
  private async openDevice(device: HIDDevice): Promise<void> {
    if (!device.opened) {
      await device.open();
    }
    this.device = device;
    device.addEventListener('inputreport', this.handleInputReport);
    this.onConnectionChange?.(true, device.productName ?? null);
  }
}
