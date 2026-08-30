/** Keeps at most one unprocessed frame and disposes a replaced frame immediately. */
export class LatestFrameQueue<T extends { close(): void }> {
  private value: T | null = null;

  replace(frame: T): void {
    this.value?.close();
    this.value = frame;
  }

  take(): T | null {
    const frame = this.value;
    this.value = null;
    return frame;
  }

  clear(): void {
    this.value?.close();
    this.value = null;
  }
}
