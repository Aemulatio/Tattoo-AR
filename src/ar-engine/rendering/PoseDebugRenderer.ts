import type { BodySide, PoseFrame } from '../contracts';
import type { ForearmLocalFrame } from '../surfaces/forearm/ForearmFrameEstimator';
import type { ForearmGeometry } from '../surfaces/forearm/ForearmGeometry';
import {
  PoseLandmark,
  upperBodyConnections,
} from '../tracking/landmark-indices';
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
    opacity = 1,
  ): void {
    const context = this.canvas.getContext('2d');
    if (!context) return;
    context.clearRect(0, 0, this.canvas.width, this.canvas.height);
    context.save();
    context.globalAlpha = Math.min(1, Math.max(0, opacity));
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

  drawForearmFrame(
    frame: PoseFrame,
    side: BodySide,
    localFrame: ForearmLocalFrame,
    transform: ViewportTransform,
    source: { width: number; height: number },
    opacity = 1,
  ): void {
    const context = this.canvas.getContext('2d');
    const indices =
      side === 'left'
        ? { wrist: PoseLandmark.leftWrist, elbow: PoseLandmark.leftElbow }
        : { wrist: PoseLandmark.rightWrist, elbow: PoseLandmark.rightElbow };
    const wrist = frame.landmarks[indices.wrist];
    const elbow = frame.landmarks[indices.elbow];
    if (!context || !wrist || !elbow) return;

    const wristDisplay = transform.sourceToDisplay({
      x: wrist.image.x * source.width,
      y: wrist.image.y * source.height,
    });
    const elbowDisplay = transform.sourceToDisplay({
      x: elbow.image.x * source.width,
      y: elbow.image.y * source.height,
    });
    const center = {
      x: (wristDisplay.x + elbowDisplay.x) / 2,
      y: (wristDisplay.y + elbowDisplay.y) / 2,
    };
    const radial = normalizeScreenAxis(
      localFrame.radial.x,
      -localFrame.radial.y,
      localFrame.tangent.x,
      -localFrame.tangent.y,
    );
    const tangent = { x: -radial.y, y: radial.x };

    context.save();
    context.globalAlpha = Math.min(1, Math.max(0, opacity));
    context.lineCap = 'round';
    drawAxis(context, wristDisplay, elbowDisplay, '#ffb45f', 3);
    drawAxis(
      context,
      center,
      { x: center.x + radial.x * 34, y: center.y + radial.y * 34 },
      '#7ed7ff',
      2,
    );
    drawAxis(
      context,
      center,
      { x: center.x + tangent.x * 25, y: center.y + tangent.y * 25 },
      '#ff7da9',
      2,
    );
    context.fillStyle = '#f2efe7';
    context.font = '9px "DM Mono", monospace';
    context.fillText(
      `${localFrame.orientationSource} ${Math.round(localFrame.rollConfidence * 100)}% · roll ${Math.round((localFrame.rollRadians * 180) / Math.PI)}°`,
      center.x + 9,
      center.y - 10,
    );
    context.restore();
  }

  drawForearmWireframe(
    frame: PoseFrame,
    side: BodySide,
    localFrame: ForearmLocalFrame,
    mesh: ForearmGeometry,
    transform: ViewportTransform,
    source: { width: number; height: number },
    opacity = 1,
  ): void {
    const context = this.canvas.getContext('2d');
    const indices = forearmLandmarks(side);
    const wrist = frame.landmarks[indices.wrist];
    const elbow = frame.landmarks[indices.elbow];
    if (!context || !wrist || !elbow) return;

    const position = mesh.geometry.getAttribute('position');
    const ringSize = mesh.radialSegments + 1;
    const sourceWrist = {
      x: wrist.image.x * source.width,
      y: wrist.image.y * source.height,
    };
    const sourceElbow = {
      x: elbow.image.x * source.width,
      y: elbow.image.y * source.height,
    };
    const pixelsPerWorldUnit =
      Math.hypot(sourceElbow.x - sourceWrist.x, sourceElbow.y - sourceWrist.y) /
      localFrame.length;

    const projectVertex = (vertexIndex: number) => {
      const relative = {
        x: position.getX(vertexIndex) - localFrame.origin.x,
        y: position.getY(vertexIndex) - localFrame.origin.y,
        z: position.getZ(vertexIndex) - localFrame.origin.z,
      };
      const longitudinal =
        (relative.x * localFrame.axis.x +
          relative.y * localFrame.axis.y +
          relative.z * localFrame.axis.z) /
        localFrame.length;
      const radial =
        relative.x * localFrame.radial.x +
        relative.y * localFrame.radial.y +
        relative.z * localFrame.radial.z;
      const tangent =
        relative.x * localFrame.tangent.x +
        relative.y * localFrame.tangent.y +
        relative.z * localFrame.tangent.z;
      const crossX =
        localFrame.radial.x * radial + localFrame.tangent.x * tangent;
      const crossY =
        localFrame.radial.y * radial + localFrame.tangent.y * tangent;

      return transform.sourceToDisplay({
        x:
          sourceWrist.x +
          (sourceElbow.x - sourceWrist.x) * longitudinal +
          crossX * pixelsPerWorldUnit,
        y:
          sourceWrist.y +
          (sourceElbow.y - sourceWrist.y) * longitudinal +
          crossY * pixelsPerWorldUnit,
      });
    };

    context.save();
    context.globalAlpha = Math.min(1, Math.max(0, opacity)) * 0.72;
    context.strokeStyle = '#7ed7ff';
    context.lineWidth = 1;

    for (
      let longitudinalIndex = 0;
      longitudinalIndex <= mesh.longitudinalSegments;
      longitudinalIndex += 1
    ) {
      context.beginPath();
      for (
        let radialIndex = 0;
        radialIndex <= mesh.radialSegments;
        radialIndex += 1
      ) {
        const point = projectVertex(longitudinalIndex * ringSize + radialIndex);
        if (radialIndex === 0) context.moveTo(point.x, point.y);
        else context.lineTo(point.x, point.y);
      }
      context.stroke();
    }

    for (
      let radialIndex = 0;
      radialIndex < mesh.radialSegments;
      radialIndex += 3
    ) {
      context.beginPath();
      for (
        let longitudinalIndex = 0;
        longitudinalIndex <= mesh.longitudinalSegments;
        longitudinalIndex += 1
      ) {
        const point = projectVertex(longitudinalIndex * ringSize + radialIndex);
        if (longitudinalIndex === 0) context.moveTo(point.x, point.y);
        else context.lineTo(point.x, point.y);
      }
      context.stroke();
    }

    context.globalAlpha = Math.min(1, Math.max(0, opacity));
    context.strokeStyle = '#ff7da9';
    context.lineWidth = 3;
    context.beginPath();
    for (
      let longitudinalIndex = 0;
      longitudinalIndex <= mesh.longitudinalSegments;
      longitudinalIndex += 1
    ) {
      const point = projectVertex(longitudinalIndex * ringSize);
      if (longitudinalIndex === 0) context.moveTo(point.x, point.y);
      else context.lineTo(point.x, point.y);
    }
    context.stroke();
    context.restore();
  }
}

function forearmLandmarks(side: BodySide): {
  wrist: number;
  elbow: number;
} {
  return side === 'left'
    ? { wrist: PoseLandmark.leftWrist, elbow: PoseLandmark.leftElbow }
    : { wrist: PoseLandmark.rightWrist, elbow: PoseLandmark.rightElbow };
}

function drawAxis(
  context: CanvasRenderingContext2D,
  from: { x: number; y: number },
  to: { x: number; y: number },
  color: string,
  width: number,
): void {
  context.strokeStyle = color;
  context.lineWidth = width;
  context.beginPath();
  context.moveTo(from.x, from.y);
  context.lineTo(to.x, to.y);
  context.stroke();
}

function normalizeScreenAxis(
  x: number,
  y: number,
  fallbackX: number,
  fallbackY: number,
): { x: number; y: number } {
  let length = Math.hypot(x, y);
  if (length > 1e-6) return { x: x / length, y: y / length };
  length = Math.hypot(fallbackX, fallbackY);
  if (length > 1e-6) return { x: fallbackX / length, y: fallbackY / length };
  return { x: 1, y: 0 };
}
