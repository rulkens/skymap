/**
 * `useSpaceMouseDevicePresence` — reactive presence flag for the
 * SpaceMouse UI gate.
 *
 * ──────────────────────────────────────────────────────────────────────
 * Why this exists
 * ──────────────────────────────────────────────────────────────────────
 * Surfacing the Connect / Sensitivity controls to every Chromium user
 * confuses the ~99 % without a 3Dconnexion device, so the SettingsPanel
 * section is gated on actual device presence — a SpaceMouse owner opens
 * Settings and the section is *there*, ready, while everybody else sees
 * nothing.  (Decision trail: Q16f in
 * `docs/grill-sessions/settings-panel-audit-2026-05-19.md`.)
 *
 * ──────────────────────────────────────────────────────────────────────
 * What "present" means here
 * ──────────────────────────────────────────────────────────────────────
 * `navigator.hid.getDevices()` returns the HID devices the user has
 * previously authorised on this origin.  It does NOT trigger a
 * permission prompt and does NOT include unpaired devices, even when
 * they're physically plugged in.  So our predicate is really "has the
 * user previously paired a SpaceMouse on this site?" — which is exactly
 * the intent (the 1 % who own one have paired once; everybody else
 * hasn't).
 *
 * First-time SpaceMouse users see no section until they pair once via
 * some other path (currently: the engine handle's `connect()` method,
 * which a dev can fire from the console, or a future `?spacemouse=1`
 * URL gate).  An accepted trade-off.
 *
 * ──────────────────────────────────────────────────────────────────────
 * Why we also listen for `connect` events
 * ──────────────────────────────────────────────────────────────────────
 * If the user has previously paired a SpaceMouse but it isn't plugged
 * in at page-load time, `getDevices()` still returns it (the
 * permission grant survives device removal) — so the initial check
 * is sufficient for the steady state.  But the `connect` event also
 * fires when a previously-authorised device is physically plugged in
 * during the session, so a user who opens skymap, then plugs in their
 * SpaceMouse, sees the section appear without a reload.  Symmetric
 * `disconnect` handling re-evaluates so the section disappears
 * cleanly when they unplug.
 *
 * ──────────────────────────────────────────────────────────────────────
 * SSR safety
 * ──────────────────────────────────────────────────────────────────────
 * `isWebHIDSupported()` short-circuits to `false` in any non-browser
 * environment, so the hook is safe to call during SSR / tests where
 * `navigator` is undefined.  The async initial check is wrapped in a
 * mount-flag closure so a fast unmount doesn't setState on a dead
 * component.
 */

import { useEffect, useState } from 'react';
import {
  SPACE_MOUSE_VENDOR_IDS,
  hasGrantedSpaceMouseDevice,
  isWebHIDSupported,
} from '../services/input/spaceMouse';

export function useSpaceMouseDevicePresence(): boolean {
  const [present, setPresent] = useState<boolean>(false);

  useEffect(() => {
    if (!isWebHIDSupported()) return;

    // Tracks unmount so the async `getDevices()` resolver doesn't
    // setState after the component has been torn down (the React
    // dev-mode warning everybody knows).
    let mounted = true;

    // Initial passive check — returns the list of previously-granted
    // devices without prompting the user.
    void hasGrantedSpaceMouseDevice().then((found) => {
      if (mounted) setPresent(found);
    });

    // Reactive updates.  `navigator.hid.connect` fires when a
    // previously-authorised device transitions to the connected state
    // (USB plug-in, Bluetooth pair, browser permission re-grant).
    // `disconnect` fires on the reverse transition (unplug, permission
    // revoke).  We filter by vendor ID so unrelated HID devices don't
    // toggle our flag.
    //
    // Re-running `hasGrantedSpaceMouseDevice()` on disconnect is the
    // right primitive: it returns true if *any* authorised SpaceMouse
    // is still attached, false if the disconnected one was the last.
    const isSpaceMouseEvent = (event: HIDConnectionEvent): boolean =>
      SPACE_MOUSE_VENDOR_IDS.includes(event.device.vendorId);

    const handleConnect = (event: HIDConnectionEvent): void => {
      if (!isSpaceMouseEvent(event)) return;
      if (mounted) setPresent(true);
    };
    const handleDisconnect = (event: HIDConnectionEvent): void => {
      if (!isSpaceMouseEvent(event)) return;
      void hasGrantedSpaceMouseDevice().then((found) => {
        if (mounted) setPresent(found);
      });
    };

    navigator.hid.addEventListener('connect', handleConnect);
    navigator.hid.addEventListener('disconnect', handleDisconnect);

    return () => {
      mounted = false;
      navigator.hid.removeEventListener('connect', handleConnect);
      navigator.hid.removeEventListener('disconnect', handleDisconnect);
    };
  }, []);

  return present;
}
