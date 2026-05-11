import type { VerificationSnapshot } from '../events.js';
import type { LandmarkList, Rect } from '../result.js';
import { createFrameToDisplayMapper, type FrameDisplayFit, type FrameMapper } from '../capture/geometry.js';
import type { VerificationSession } from '../flow/verification-session.js';

export interface DiagnosticsOverlayOptions {
  fit?: FrameDisplayFit;
  mirrored?: boolean;
}

const resizeCanvas = (canvas: HTMLCanvasElement) => {
  const rect = canvas.getBoundingClientRect();
  const ratio = window.devicePixelRatio || 1;
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
) => {
  context.save();
  context.strokeStyle = color;
  context.lineWidth = lineWidth;
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

  if (diagnostics.detection?.box) {
    drawRect(
      context,
      mapper.mapRect(diagnostics.detection.box),
      diagnostics.faceFit?.isAligned ? 'rgba(70, 230, 160, 0.95)' : 'rgba(255, 210, 80, 0.95)',
      2,
    );
  }

  if (diagnostics.mesh?.landmarks) {
    drawLandmarks(context, diagnostics.mesh.landmarks, mapper);
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
