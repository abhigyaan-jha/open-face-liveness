import { VerificationError } from '../errors.js';
import type { FaceFitOptions } from '../config.js';
import type { CameraStreamInfo } from '../events.js';
import { applyDefaultCameraZoom, stopMediaStream, waitForVideoMetadata } from './media.js';

export interface CameraHandle {
  stop(): void;
  stream: MediaStream;
  streamInfo: CameraStreamInfo;
  video: HTMLVideoElement;
}

export interface RequestCameraOptions {
  face: FaceFitOptions;
  video: HTMLVideoElement;
}

export const requestCamera = async ({ face, video }: RequestCameraOptions): Promise<CameraHandle> => {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new VerificationError(
      'camera.unavailable',
      'Camera access is not available in this browser.',
    );
  }

  const stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: {
      facingMode: 'user',
    },
  });

  try {
    const streamInfo = await applyDefaultCameraZoom(stream, face);
    video.srcObject = stream;
    await waitForVideoMetadata(video);
    await video.play();

    return {
      stop() {
        stopMediaStream(stream);
        if (video.srcObject === stream) {
          video.srcObject = null;
        }
      },
      stream,
      streamInfo,
      video,
    };
  } catch (error) {
    stopMediaStream(stream);
    if (video.srcObject === stream) {
      video.srcObject = null;
    }
    throw error;
  }
};
