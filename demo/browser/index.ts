import { WebVerify } from '../../src/index.js';

const video = document.querySelector<HTMLVideoElement>('#video');
const button = document.querySelector<HTMLButtonElement>('#start');
const result = document.querySelector<HTMLPreElement>('#result');

button?.addEventListener('click', async () => {
  if (!video || !result) return;

  const verify = new WebVerify();
  result.textContent = JSON.stringify(await verify.verify(video), null, 2);
});
