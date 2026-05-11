export interface GuideOptions {
  color?: string;
  lineWidth?: number;
}

export const drawGuide = (context: CanvasRenderingContext2D, options: GuideOptions = {}): void => {
  const { color = '#22c55e', lineWidth = 2 } = options;
  const { canvas } = context;
  const width = canvas.width * 0.62;
  const height = width * 1.28;
  const x = (canvas.width - width) / 2;
  const y = (canvas.height - height) / 2;

  context.save();
  context.strokeStyle = color;
  context.lineWidth = lineWidth;
  context.strokeRect(x, y, width, height);
  context.restore();
};

export { mountDiagnosticsOverlay } from './diagnostics.js';
export type { DiagnosticsOverlayOptions } from './diagnostics.js';
