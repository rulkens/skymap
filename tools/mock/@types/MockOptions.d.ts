export type MockOptions = {
  readonly name: string; // src/dev/mocks/<name>.tsx
  readonly hash: string; // without the leading '#', '' when absent
  readonly url: string; // trailing slashes stripped
  readonly width: number;
  readonly height: number;
  readonly phone: boolean; // touch + mobile viewport emulation
};
