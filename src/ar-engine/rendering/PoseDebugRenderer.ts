import type { PoseFrame } from '../contracts';
import { upperBodyConnections } from '../tracking/landmark-indices';
import { ViewportTransform } from '../camera/ViewportTransform';

export class PoseDebugRenderer {
  private readonly canvas: HTMLCanvasElement;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
  }

  clear(): void {
    const context = this.canvas.getContext('2d');
    context?.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  draw(
    frame: PoseFrame,
    transform: ViewportTransform,
    source: { width: number; height: number },
  ): void {
    const context = this.canvas.getContext('2d');
    if (!context) return;
    context.clearRect(0, 0, this.canvas.width, this.canvas.height);
    context.save();
    context.strokeStyle = '#e1ff48';
    context.fillStyle = '#0d1608';
    context.lineWidth = 4;
    for (const [from, to] of upperBodyConnections) {
      const a = frame.landmarks[from];
      const b = frame.landmarks[to];
      if (!a || !b || a.visibility < 0.45 || b.visibility < 0.45) continue;
      const pa = transform.sourceToDisplay({
        x: a.image.x * source.width,
        y: a.image.y * source.height,
      });
      const pb = transform.sourceToDisplay({
        x: b.image.x * source.width,
        y: b.image.y * source.height,
      });
      context.beginPath();
      context.moveTo(pa.x, pa.y);
      context.lineTo(pb.x, pb.y);
      context.stroke();
    }
    for (const point of frame.landmarks) {
      if (point.visibility < 0.45) continue;
      const p = transform.sourceToDisplay({
        x: point.image.x * source.width,
        y: point.image.y * source.height,
      });
      context.beginPath();
      context.arc(p.x, p.y, 4, 0, Math.PI * 2);
      context.fill();
      context.stroke();
    }
    context.restore();
  }
}
