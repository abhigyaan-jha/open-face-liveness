// Copies the TensorFlow.js wasm binaries into vendor/tfjs-wasm/ so apps serve them
// from their own origin. Run after changing the @tensorflow/tfjs-backend-wasm version.
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const TFJS_WASM_FILES = [
  'tfjs-backend-wasm.wasm',
  'tfjs-backend-wasm-simd.wasm',
  'tfjs-backend-wasm-threaded-simd.wasm',
];

const root = process.cwd();
const sourceDirectory = path.join(root, 'node_modules/@tensorflow/tfjs-backend-wasm/dist');
const targetDirectory = path.join(root, 'vendor/tfjs-wasm');

fs.mkdirSync(targetDirectory, { recursive: true });
for (const file of TFJS_WASM_FILES) {
  const target = path.join(targetDirectory, file);
  fs.copyFileSync(path.join(sourceDirectory, file), target);
  fs.chmodSync(target, 0o644);
}

console.log(`Copied ${TFJS_WASM_FILES.length} files to vendor/tfjs-wasm/.`);
