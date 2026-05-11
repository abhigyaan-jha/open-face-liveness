import { WebVerify } from '../../src/index.js';
import { requestCamera } from '../../src/capture/index.js';

const video = document.querySelector<HTMLVideoElement>('#video');
const button = document.querySelector<HTMLButtonElement>('#start');
const result = document.querySelector<HTMLPreElement>('#result');

button?.addEventListener('click', async () => {
  if (!video || !result) return;

  await requestCamera(video);
  const verify = new WebVerify();
  result.textContent = JSON.stringify(await verify.verify(video), null, 2);
});

