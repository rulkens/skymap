/** A display as setup stores and placement compares it; width and height are physical pixels. */
export type DisplayInfo = {
  id: number;
  /** 1-based in the OS's order: how the test grid and the page name it, since ids mean nothing to a person. */
  number: number;
  /** The OS's name for it ("LG HDR 4K"); often empty on Windows. */
  label: string;
  width: number;
  height: number;
  primary: boolean;
};
