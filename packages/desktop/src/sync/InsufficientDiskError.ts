export class InsufficientDiskError extends Error {
  constructor(
    readonly neededBytes: number,
    readonly freeBytes: number,
  ) {
    super(`Not enough disk space: need ${neededBytes} bytes, ${freeBytes} free`);
  }
}
