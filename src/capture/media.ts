import type { FaceFitOptions } from '../config.js';
import type { CameraStreamInfo } from '../events.js';

interface ZoomRange {
  max: number;
  min: number;
  step?: number;
}

type ZoomCapabilities = MediaTrackCapabilities & {
  zoom?: ZoomRange;
};

type ZoomSettings = MediaTrackSettings & {
  zoom?: number;
};

const quantizeConstraintValue = (
  value: number,
  min: number,
  max: number,
  step?: number,
): number => {
  let result = Math.min(Math.max(value, min), max);

  if (Number.isFinite(step) && Number(step) > 0) {
    result = min + Math.round((result - min) / Number(step)) * Number(step);
  }

  return Number(Math.min(Math.max(result, min), max).toFixed(4));
};

export const getErrorMessage = (error: unknown, fallback = 'Unable to start camera session.'): string => {
  if (error instanceof DOMException) {
    return `${error.name}: ${error.message}`;
  }

  if (error instanceof Error && error.message.length > 0) {
    return error.message;
  }

  if (typeof error === 'string' && error.length > 0) {
    return error;
  }

  return fallback;
};

export const waitForVideoMetadata = async (video: HTMLVideoElement): Promise<void> => {
  if (video.readyState >= HTMLMediaElement.HAVE_METADATA) {
    return;
  }

  await new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
      video.removeEventListener('error', handleError);
    };
    const handleLoadedMetadata = () => {
      cleanup();
      resolve();
    };
    const handleError = () => {
      cleanup();
      reject(new Error('Unable to read camera metadata.'));
    };

    video.addEventListener('loadedmetadata', handleLoadedMetadata);
    video.addEventListener('error', handleError);
  });
};

export const stopMediaStream = (stream: MediaStream | null | undefined) => {
  if (!stream) {
    return;
  }

  for (const track of stream.getTracks()) {
    track.stop();
  }
};

export const applyDefaultCameraZoom = async (
  stream: MediaStream,
  faceOptions: FaceFitOptions,
): Promise<CameraStreamInfo> => {
  const [videoTrack] = stream.getVideoTracks();

  if (
    !videoTrack ||
    typeof videoTrack.getCapabilities !== 'function' ||
    typeof videoTrack.applyConstraints !== 'function'
  ) {
    return {
      zoomApplied: null,
      zoomSupported: false,
    };
  }

  const capabilities = videoTrack.getCapabilities() as ZoomCapabilities;
  const zoomCapability = capabilities.zoom;

  if (
    !zoomCapability ||
    !Number.isFinite(zoomCapability.min) ||
    !Number.isFinite(zoomCapability.max)
  ) {
    return {
      zoomApplied: null,
      zoomSupported: false,
    };
  }

  const targetZoom = quantizeConstraintValue(
    faceOptions.cameraZoom,
    zoomCapability.min,
    zoomCapability.max,
    zoomCapability.step,
  );

  try {
    await videoTrack.applyConstraints({
      advanced: [{ zoom: targetZoom } as unknown as MediaTrackConstraintSet],
    });
  } catch (advancedError) {
    try {
      await videoTrack.applyConstraints({ zoom: targetZoom } as MediaTrackConstraints);
    } catch {
      return {
        zoomApplied: null,
        zoomSupported: true,
      };
    }

    void advancedError;
  }

  const settings =
    typeof videoTrack.getSettings === 'function' ? (videoTrack.getSettings() as ZoomSettings) : null;

  return {
    zoomApplied: Number.isFinite(settings?.zoom) ? Number(settings?.zoom) : targetZoom,
    zoomSupported: true,
  };
};
