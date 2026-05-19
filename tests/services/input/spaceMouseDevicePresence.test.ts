/**
 * Tests for the passive device-presence predicates used by the
 * SettingsPanel SpaceMouse gate (audit Q16f).
 *
 * The helpers we exercise here are pure(ish) wrappers around
 * `navigator.hid` — we stub the WebHID surface with a tiny in-memory
 * shim per test, then assert the predicate matches the expected
 * yes/no/unsupported outcome.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  hasGrantedSpaceMouseDevice,
  isWebHIDSupported,
  SPACE_MOUSE_VENDOR_IDS,
} from '../../../src/services/input/spaceMouse';

// ── Test helpers ─────────────────────────────────────────────────────────
//
// `navigator.hid` is a structural type we declare in
// `src/services/input/webhid.d.ts`.  For these tests we don't need a
// real HID surface — just an object that exposes `getDevices()` returning
// a fake array of HID-device-shaped records.  Using `unknown` plus an
// `as` cast at the assignment site keeps the test honest about the
// shape it requires (only `getDevices()`).

type FakeHidDevice = { vendorId: number };

function withFakeNavigatorHid<T>(
  hid: { getDevices: () => Promise<FakeHidDevice[]> } | null,
  body: () => Promise<T>,
): Promise<T> {
  const originalNavigator = globalThis.navigator;
  if (hid === null) {
    // Remove HID entirely — simulates Firefox/Safari.
    Object.defineProperty(globalThis, 'navigator', {
      value: {},
      configurable: true,
      writable: true,
    });
  } else {
    Object.defineProperty(globalThis, 'navigator', {
      value: { hid },
      configurable: true,
      writable: true,
    });
  }
  return body().finally(() => {
    Object.defineProperty(globalThis, 'navigator', {
      value: originalNavigator,
      configurable: true,
      writable: true,
    });
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('isWebHIDSupported', () => {
  it('returns false when navigator has no `hid` property (Firefox / Safari)', async () => {
    await withFakeNavigatorHid(null, async () => {
      expect(isWebHIDSupported()).toBe(false);
    });
  });

  it('returns true when navigator.hid is present (Chromium)', async () => {
    await withFakeNavigatorHid({ getDevices: async () => [] }, async () => {
      expect(isWebHIDSupported()).toBe(true);
    });
  });
});

describe('hasGrantedSpaceMouseDevice', () => {
  it('returns false when WebHID is unsupported', async () => {
    await withFakeNavigatorHid(null, async () => {
      expect(await hasGrantedSpaceMouseDevice()).toBe(false);
    });
  });

  it('returns false when no paired devices match the 3Dconnexion / Logitech vendor IDs', async () => {
    // Random unrelated HID device (e.g. a USB gaming mouse).
    await withFakeNavigatorHid(
      { getDevices: async () => [{ vendorId: 0x1234 }] },
      async () => {
        expect(await hasGrantedSpaceMouseDevice()).toBe(false);
      },
    );
  });

  it('returns true when a paired 3Dconnexion device is present (vendor 0x256f)', async () => {
    await withFakeNavigatorHid(
      { getDevices: async () => [{ vendorId: 0x256f }] },
      async () => {
        expect(await hasGrantedSpaceMouseDevice()).toBe(true);
      },
    );
  });

  it('returns true when a paired Logitech-era SpaceNavigator is present (vendor 0x046d)', async () => {
    await withFakeNavigatorHid(
      { getDevices: async () => [{ vendorId: 0x046d }] },
      async () => {
        expect(await hasGrantedSpaceMouseDevice()).toBe(true);
      },
    );
  });

  it('returns false (does not throw) when getDevices() rejects', async () => {
    // Stub console.warn so the test output stays clean.
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    await withFakeNavigatorHid(
      { getDevices: async () => Promise.reject(new Error('permission denied')) },
      async () => {
        expect(await hasGrantedSpaceMouseDevice()).toBe(false);
      },
    );
  });
});

describe('SPACE_MOUSE_VENDOR_IDS', () => {
  it('contains both the Logitech-era and current 3Dconnexion vendor IDs', () => {
    // The connect-event listener in `useSpaceMouseDevicePresence` filters
    // by this list — if either ID disappears, plugging in that device
    // silently fails to trigger the section gate.
    expect(SPACE_MOUSE_VENDOR_IDS).toContain(0x046d);
    expect(SPACE_MOUSE_VENDOR_IDS).toContain(0x256f);
  });
});
