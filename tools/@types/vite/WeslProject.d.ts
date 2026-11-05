/** A wesl.toml's shader set, read once and shared by every `?static` link. */
export type WeslProject = {
  /** Absolute WESL root; module paths are relative to it. */
  readonly root: string;
  /** The root relative to the toml, as the linker's debug paths want it. */
  readonly debugWeslRoot: string;
  /** Every included file, absolute, for watching. */
  readonly files: readonly string[];
  /** Root-relative unix path → source. */
  readonly weslSrc: Readonly<Record<string, string>>;
};
