export interface CameraHandle {
  stream: MediaStream;
  video: HTMLVideoElement;
}

export const requestCamera = async (video: HTMLVideoElement): Promise<CameraHandle> => {
  const stream = await navigator.mediaDevices.getUserMedia({ video: true });
  video.srcObject = stream;
  await video.play();
  return { stream, video };
};

