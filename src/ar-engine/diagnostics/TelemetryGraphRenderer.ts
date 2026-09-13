import { syncCanvasSize } from '../rendering/syncCanvasSize';
import type { TelemetrySample } from './TelemetryHistory';

interface GraphDefinition {
  label: string;
  color: string;
  maximum: number;
  value(sample: TelemetrySample): number;
  format(value: number): string;
}

const graphs: ReadonlyArray<GraphDefinition> = [
  {
    label: 'INFERENCE',
    color: '#ffb45f',
    maximum: 120,
    value: (sample) => sample.inferenceMs,
    format: (value) => `${value.toFixed(0)} ms`,
  },
  {
    label: 'TRACKING',
    color: '#e1ff48',
    maximum: 30,
    value: (sample) => sample.resultsPerSecond,
    format: (value) => `${value.toFixed(1)} fps`,
  },
  {
    label: 'RENDER',
    color: '#7ed7ff',
    maximum: 60,
    value: (sample) => sample.rendersPerSecond,
    format: (value) => `${value.toFixed(1)} fps`,
  },
  {
    label: 'CONFIDENCE',
    color: '#ff7da9',
    maximum: 1,
    value: (sample) => sample.confidence,
    format: (value) => `${Math.round(value * 100)}%`,
  },
];

export class TelemetryGraphRenderer {
  private readonly canvas: HTMLCanvasElement;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
  }

  draw(samples: ReadonlyArray<TelemetrySample>): void {
    const rect = this.canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const dpr = window.devicePixelRatio || 1;
    syncCanvasSize(this.canvas, rect.width * dpr, rect.height * dpr);
    const context = this.canvas.getContext('2d');
    if (!context) return;
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.clearRect(0, 0, rect.width, rect.height);
    context.fillStyle = '#0b0d0b';
    context.fillRect(0, 0, rect.width, rect.height);

    const rowHeight = rect.height / graphs.length;
    graphs.forEach((graph, index) => {
      this.drawGraph(context, graph, samples, {
        x: 10,
        y: index * rowHeight,
        width: rect.width - 20,
        height: rowHeight,
      });
    });
  }

  private drawGraph(
    context: CanvasRenderingContext2D,
    graph: GraphDefinition,
    samples: ReadonlyArray<TelemetrySample>,
    bounds: { x: number; y: number; width: number; height: number },
  ): void {
    const latest = samples.at(-1);
    context.strokeStyle = 'rgba(242, 239, 231, 0.09)';
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(bounds.x, bounds.y + bounds.height - 0.5);
    context.lineTo(bounds.x + bounds.width, bounds.y + bounds.height - 0.5);
    context.stroke();

    context.fillStyle = '#737a70';
    context.font = '9px "DM Mono", monospace';
    context.fillText(graph.label, bounds.x, bounds.y + 13);
    if (latest) {
      context.fillStyle = graph.color;
      context.textAlign = 'right';
      context.fillText(
        graph.format(graph.value(latest)),
        bounds.x + bounds.width,
        bounds.y + 13,
      );
      context.textAlign = 'left';
    }

    if (samples.length < 2) return;
    const graphTop = bounds.y + 18;
    const graphHeight = Math.max(1, bounds.height - 23);
    context.strokeStyle = graph.color;
    context.lineWidth = 1.5;
    context.beginPath();
    samples.forEach((sample, index) => {
      const x =
        bounds.x + (index / Math.max(1, samples.length - 1)) * bounds.width;
      const normalized = Math.min(
        1,
        Math.max(0, graph.value(sample) / graph.maximum),
      );
      const y = graphTop + graphHeight * (1 - normalized);
      if (index === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    });
    context.stroke();
  }
}
