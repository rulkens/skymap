/** AxisPress — the pointer-down facts a control scheme binds a navigator axis from. */

export type AxisPress = {
  readonly button: number;
  readonly ctrl: boolean;
  readonly alt: boolean;
  readonly shift: boolean;
  readonly pointerType: string;
};
