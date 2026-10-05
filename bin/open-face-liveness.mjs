#!/usr/bin/env node
// Copies the package's models and TensorFlow.js wasm files into a directory the app serves,
// for apps whose bundler does not emit `new URL(..., import.meta.url)` assets.
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ASSET_DIRECTORIES = ['models', 'vendor/tfjs-wasm'];

const USAGE = `Usage: open-face-liveness init <directory>

Copies models/ and vendor/tfjs-wasm/ into <directory>, e.g. public/open-face-liveness.
Then set models.assetBaseUrl to the URL that directory is served from.
Add the same command to your package.json "postinstall" script to keep the copy in sync on upgrades.`;

const [command, target, ...rest] = process.argv.slice(2);

if (command === '--help' || command === '-h' || command === 'help') {
  console.log(USAGE);
  process.exit(0);
}

if (command !== 'init' || !target || rest.length) {
  console.error(USAGE);
  process.exit(1);
}

const targetRoot = path.resolve(target);
let copiedFiles = 0;
for (const directory of ASSET_DIRECTORIES) {
  const source = path.join(packageRoot, directory);
  fs.cpSync(source, path.join(targetRoot, directory), {
    filter: (file) => {
      if (path.basename(file) === 'README.md') {
        return false;
      }
      if (fs.statSync(file).isFile()) {
        copiedFiles += 1;
      }
      return true;
    },
    recursive: true,
  });
}

const { version } = JSON.parse(fs.readFileSync(path.join(packageRoot, 'package.json'), 'utf8'));
console.log(`Copied ${copiedFiles} open-face-liveness@${version} asset files to ${path.relative(process.cwd(), targetRoot) || '.'}.`);
console.log("Set models.assetBaseUrl to the URL it is served from, e.g. createOpenFaceLivenessClient({ models: { assetBaseUrl: '/open-face-liveness/' } }).");
