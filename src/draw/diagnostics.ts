import type { VerificationSnapshot } from '../events.js';
import type { LandmarkList, Rect, SpoofFrameResult } from '../result.js';
import { createFrameToDisplayMapper, type FrameDisplayFit, type FrameMapper } from '../capture/geometry.js';
import type { VerificationSession } from '../flow/verification-session.js';

export interface DiagnosticsOverlayOptions {
  fit?: FrameDisplayFit;
  mirrored?: boolean;
}

const clamp = (value: number, min: number, max: number): number => Math.min(Math.max(value, min), max);

const getCanvasPixelRatio = (): number => Math.max(1, window.devicePixelRatio || 1);

const resizeCanvas = (canvas: HTMLCanvasElement) => {
  const rect = canvas.getBoundingClientRect();
  const ratio = getCanvasPixelRatio();
  const width = Math.max(1, Math.round(rect.width * ratio));
  const height = Math.max(1, Math.round(rect.height * ratio));

  if (canvas.width !== width) {
    canvas.width = width;
  }

  if (canvas.height !== height) {
    canvas.height = height;
  }
};

const drawRect = (
  context: CanvasRenderingContext2D,
  rect: Rect,
  color: string,
  lineWidth = 2,
  dash: readonly number[] = [],
) => {
  context.save();
  context.strokeStyle = color;
  context.lineWidth = lineWidth;
  context.setLineDash([...dash]);
  context.strokeRect(rect.x, rect.y, rect.width, rect.height);
  context.restore();
};

const drawLandmarks = (
  context: CanvasRenderingContext2D,
  landmarks: LandmarkList,
  mapper: FrameMapper,
) => {
  context.save();
  context.fillStyle = 'rgba(255, 255, 255, 0.85)';
  for (let index = 0; index < landmarks.length; index += 3) {
    const { x, y } = mapper.mapPoint(landmarks[index], landmarks[index + 1]);
    context.fillRect(x - 1, y - 1, 2, 2);
  }
  context.restore();
};

const getSpoofScore = (spoof: SpoofFrameResult): number => {
  switch (spoof.label) {
    case 'real':
      return spoof.realScore;
    case 'paper':
      return spoof.paperScore;
    case 'screen':
      return spoof.screenScore;
  }
};

const drawSpoofGuide = (
  context: CanvasRenderingContext2D,
  rect: Rect,
  spoof: SpoofFrameResult,
) => {
  const isReal = spoof.label === 'real';
  const color = isReal ? 'rgba(70, 230, 160, 0.95)' : 'rgba(255, 80, 80, 0.95)';
  const score = getSpoofScore(spoof);
  const text = `${isReal ? 'REAL' : 'SPOOF'} ${score.toFixed(2)}`;
  const ratio = getCanvasPixelRatio();
  const fontSize = clamp((rect.width / ratio) * 0.13, 20, 30) * ratio;
  const paddingX = 12 * ratio;
  const paddingY = 8 * ratio;

  context.save();
  context.font = `700 ${fontSize}px monospace`;
  const textWidth = context.measureText(text).width;
  const labelWidth = textWidth + paddingX * 2;
  const labelHeight = fontSize + paddingY * 2;
  const inset = 8 * ratio;
  const maxX = Math.max(inset, context.canvas.width - labelWidth - inset);
  const x = clamp(rect.x, inset, maxX);
  const y = Math.max(inset, rect.y - labelHeight - 10 * ratio);

  context.fillStyle = 'rgba(0, 0, 0, 0.72)';
  context.fillRect(x, y, labelWidth, labelHeight);
  context.fillStyle = color;
  context.fillRect(x, y, 6 * ratio, labelHeight);
  context.fillText(text, x + paddingX, y + paddingY + fontSize * 0.82);
  context.restore();
};

const drawPoseLabel = (
  context: CanvasRenderingContext2D,
  rect: Rect,
  pose: { pitch: number; roll: number; yaw: number },
) => {
  const ratio = getCanvasPixelRatio();
  const text = `yaw ${pose.yaw.toFixed(2)} pitch ${pose.pitch.toFixed(2)} roll ${pose.roll.toFixed(2)}`;
  const fontSize = 11 * ratio;
  const padding = 6 * ratio;

  context.save();
  context.font = `600 ${fontSize}px monospace`;
  const width = context.measureText(text).width + padding * 2;
  const height = fontSize + padding * 2;
  const x = clamp(rect.x, 4 * ratio, Math.max(4 * ratio, context.canvas.width - width - 4 * ratio));
  const y = clamp(
    rect.y + rect.height + 6 * ratio,
    4 * ratio,
    Math.max(4 * ratio, context.canvas.height - height - 4 * ratio),
  );

  context.fillStyle = 'rgba(0, 0, 0, 0.68)';
  context.fillRect(x, y, width, height);
  context.fillStyle = 'rgba(180, 245, 255, 0.96)';
  context.fillText(text, x + padding, y + padding + fontSize * 0.78);
  context.restore();
};

const drawSnapshot = (
  canvas: HTMLCanvasElement,
  context: CanvasRenderingContext2D,
  snapshot: VerificationSnapshot,
  options: Required<DiagnosticsOverlayOptions>,
) => {
  resizeCanvas(canvas);
  context.clearRect(0, 0, canvas.width, canvas.height);

  const diagnostics = snapshot.diagnostics;
  if (!diagnostics?.frameSize.width || !diagnostics.frameSize.height) {
    return;
  }

  const { height: frameHeight, width: frameWidth } = diagnostics.frameSize;
  const mapper = createFrameToDisplayMapper(
    { height: frameHeight, width: frameWidth },
    { height: canvas.height, width: canvas.width },
    options,
  );

  if (diagnostics.mesh?.landmarks) {
    drawLandmarks(context, diagnostics.mesh.landmarks, mapper);
  }

  let fitRect: Rect | null = null;
  if (diagnostics.faceFit?.comparisonBox) {
    fitRect = mapper.mapRect(diagnostics.faceFit.comparisonBox);
    drawRect(
      context,
      fitRect,
      diagnostics.faceFit.isAligned ? 'rgba(70, 230, 160, 0.95)' : 'rgba(80, 225, 255, 0.95)',
      2,
    );

    if (diagnostics.mesh?.geometry.pose) {
      drawPoseLabel(context, fitRect, diagnostics.mesh.geometry.pose);
    }
  }

  if (diagnostics.mesh?.geometry.anchorBox) {
    drawRect(
      context,
      mapper.mapRect(diagnostics.mesh.geometry.anchorBox),
      'rgba(80, 150, 255, 0.9)',
      1,
    );
  }

  const detectionRect = diagnostics.detection?.box ? mapper.mapRect(diagnostics.detection.box) : null;
  if (!fitRect && detectionRect) {
    drawRect(
      context,
      detectionRect,
      'rgba(255, 210, 80, 0.72)',
      1,
      [6, 4],
    );
  }

  if (diagnostics.spoof) {
    const spoofRect = fitRect ?? detectionRect;
    if (spoofRect) {
      drawSpoofGuide(context, spoofRect, diagnostics.spoof);
    }
  }
};

export const mountDiagnosticsOverlay = (
  session: VerificationSession,
  element: HTMLElement | HTMLCanvasElement,
  options: DiagnosticsOverlayOptions = {},
): (() => void) => {
  const canvas =
    element instanceof HTMLCanvasElement ? element : document.createElement('canvas');
  const ownsCanvas = canvas !== element;
  const context = canvas.getContext('2d');
  const resolvedOptions: Required<DiagnosticsOverlayOptions> = {
    fit: options.fit ?? 'fill',
    mirrored: options.mirrored ?? false,
  };

  if (!context) {
    throw new Error('Unable to create diagnostics overlay context.');
  }

  if (ownsCanvas) {
    canvas.style.inset = '0';
    canvas.style.height = '100%';
    canvas.style.pointerEvents = 'none';
    canvas.style.position = 'absolute';
    canvas.style.width = '100%';
    element.appendChild(canvas);
  }

  const resizeObserver = new ResizeObserver(() => {
    drawSnapshot(canvas, context, session.getSnapshot(), resolvedOptions);
  });
  resizeObserver.observe(canvas);

  const unsubscribe = session.subscribe((snapshot) => {
    drawSnapshot(canvas, context, snapshot, resolvedOptions);
  });

  return () => {
    unsubscribe();
    resizeObserver.disconnect();
    context.clearRect(0, 0, canvas.width, canvas.height);
    if (ownsCanvas) {
      canvas.remove();
    }
  };
};
