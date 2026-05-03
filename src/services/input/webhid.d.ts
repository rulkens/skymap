/**
 * webhid — minimal ambient declarations for the WebHID API.
 *
 * ### Why we ship our own types instead of `@types/w3c-web-hid`
 *
 * The DOM lib in TypeScript 5.x doesn't yet include WebHID, and the
 * community packages (`@types/w3c-web-hid`, `w3c-webhid` etc.) are either
 * unmaintained or pull in heavy dependency trees we don't need. Since we
 * only touch a tiny corner of the surface (open / read input reports / list
 * paired devices), declaring our own minimal subset keeps the bundle clean
 * and the types honest about exactly what we use.
 *
 * If/when WebHID lands in lib.dom.d.ts these declarations can be deleted —
 * the structural typing in spaceMouse.ts will continue to work.
 *
 * ### Spec
 *
 * https://wicg.github.io/webhid/ — currently a WICG draft, shipped in
 * Chromium 89+.
 */

// Note the lack of `declare global { ... }` wrapping: this file is loaded
// as part of the project tsconfig `include` glob (`src/**`), so its
// top-level `interface` declarations augment the global scope directly.

/**
 * A single paired/openable HID device.
 *
 * Only the fields and methods we actually call are declared. EventTarget
 * is the supertype that gives us `addEventListener` and `removeEventListener`.
 */
interface HIDDevice extends EventTarget {
  readonly opened: boolean;
  readonly vendorId: number;
  readonly productId: number;
  readonly productName: string;
  open(): Promise<void>;
  close(): Promise<void>;
  addEventListener(type: 'inputreport', listener: (ev: HIDInputReportEvent) => void): void;
  removeEventListener(type: 'inputreport', listener: (ev: HIDInputReportEvent) => void): void;
}

/**
 * Filter for `requestDevice` — at least one of `vendorId` / `productId` /
 * `usagePage` / `usage` is required by spec, but a sole `vendorId` is the
 * common case for vendor-agnostic device pickers like ours.
 */
interface HIDDeviceFilter {
  vendorId?: number;
  productId?: number;
  usagePage?: number;
  usage?: number;
}

interface HIDDeviceRequestOptions {
  filters: HIDDeviceFilter[];
}

/**
 * Event fired on a `HIDDevice` whenever the kernel hands us a new input
 * report. `data` is a DataView over the report bytes (excluding the report
 * ID, which is exposed separately as `reportId`).
 */
interface HIDInputReportEvent extends Event {
  readonly device: HIDDevice;
  readonly reportId: number;
  readonly data: DataView;
}

/**
 * The `navigator.hid` entry point. Only the two methods we actually call
 * are declared — `requestDevice` (user gesture required) and `getDevices`
 * (silent re-acquire of previously-paired devices).
 */
interface HID extends EventTarget {
  requestDevice(options: HIDDeviceRequestOptions): Promise<HIDDevice[]>;
  getDevices(): Promise<HIDDevice[]>;
}

interface Navigator {
  readonly hid: HID;
}
