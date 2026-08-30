/** Rejects results that arrive out of order after a camera or worker transition. */
export class StaleResultGate {
  private lastAcceptedTimestampMs = -Infinity;

  accept(timestampMs: number): boolean {
    if (timestampMs <= this.lastAcceptedTimestampMs) return false;
    this.lastAcceptedTimestampMs = timestampMs;
    return true;
  }

  reset(): void {
    this.lastAcceptedTimestampMs = -Infinity;
  }
}
