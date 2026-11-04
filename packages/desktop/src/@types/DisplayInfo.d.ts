/** A display as setup stores and placement compares it; width and height are physical pixels. */
export type DisplayInfo = {
  id: number;
  /** The OS's name for it ("LG HDR 4K"); often empty on Windows. */
  label: string;
  width: number;
  height: number;
  primary: boolean;
};
