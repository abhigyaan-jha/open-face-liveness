import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { OUTPUT_PATH, TFJS_WASM_FILES, generateBundledAssets } from './generate-bundled-assets.mjs';

const root = process.cwd();
const toPosix = (value) => value.split(path.sep).join('/');

const readJson = (relativePath) =>
  JSON.parse(fs.readFileSync(path.join(root, relativePath), 'utf8'));

const walk = (relativeDirectory) => {
  const directory = path.join(root, relativeDirectory);
  if (!fs.existsSync(directory)) {
    return [];
  }

  const entries = fs.readdirSync(directory, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const relativePath = path.join(relativeDirectory, entry.name);

    if (entry.isDirectory()) {
      return walk(relativePath);
    }

    return [toPosix(relativePath)];
  });
};

const packageJson = readJson('package.json');
const errors = [];

if (packageJson.private !== true) {
  errors.push('package.json must stay private until the release surface is finalized.');
}

const forbiddenFileEntries = new Set(['src', 'demo', 'test', 'node_modules']);
const publishedFileEntries = new Set(packageJson.files ?? []);
for (const entry of forbiddenFileEntries) {
  if (publishedFileEntries.has(entry)) {
    errors.push(`package.json files must not include ${entry}.`);
  }
}

const sourceStems = new Set(
  walk('src')
    .filter((file) => file.endsWith('.ts') && !file.endsWith('.d.ts'))
    .map((file) => file.replace(/^src\//, '').replace(/\.ts$/, '')),
);

const expectedDistFiles = new Set(
  [...sourceStems].flatMap((stem) => [
    `dist/${stem}.d.ts`,
    `dist/${stem}.js`,
  ]),
);

const distFiles = walk('dist');
if (!distFiles.length) {
  errors.push('dist is missing. Run npm run build before packing.');
}

const staleDistFiles = distFiles.filter((file) => !expectedDistFiles.has(file));
if (staleDistFiles.length) {
  errors.push([
    'dist contains files that do not match src output:',
    ...staleDistFiles.map((file) => `  - ${file}`),
  ].join('\n'));
}

const manifest = readJson('models/manifest.json');
const absoluteModelUrls = manifest.models
  .filter((model) => typeof model.url === 'string')
  .filter((model) => model.url.startsWith('/') || /^[a-z][a-z\d+\-.]*:/i.test(model.url));
if (absoluteModelUrls.length) {
  errors.push([
    'models/manifest.json should use relative model URLs:',
    ...absoluteModelUrls.map((model) => `  - ${model.id}: ${model.url}`),
  ].join('\n'));
}

const tfjsPackages = ['@tensorflow/tfjs-core', '@tensorflow/tfjs-converter', '@tensorflow/tfjs-backend-wasm'];
const tfjsVersions = new Set(tfjsPackages.map((name) => packageJson.dependencies?.[name]));
const [tfjsVersion] = tfjsVersions;
if (tfjsVersions.size !== 1 || typeof tfjsVersion !== 'string' || !/^\d+\.\d+\.\d+$/.test(tfjsVersion)) {
  errors.push(`${tfjsPackages.join(', ')} must be pinned to the same exact version because their JS and wasm assets are a matched set.`);
}

const sha256 = (relativePath) => createHash('sha256').update(fs.readFileSync(path.join(root, relativePath))).digest('hex');

for (const model of manifest.models) {
  const modelDirectory = path.posix.dirname(model.url);
  const listedFiles = Object.keys(model.files ?? {}).sort();
  const actualFiles = walk(path.join('models', modelDirectory)).map((file) => path.posix.basename(file)).sort();
  if (listedFiles.join() !== actualFiles.join()) {
    errors.push(`models/manifest.json lists [${listedFiles.join(', ')}] for ${model.id}, but models/${modelDirectory}/ contains [${actualFiles.join(', ')}].`);
    continue;
  }

  for (const [file, hash] of Object.entries(model.files)) {
    if (sha256(path.posix.join('models', modelDirectory, file)) !== hash) {
      errors.push(`models/${modelDirectory}/${file} does not match its SHA-256 in models/manifest.json.`);
    }
  }
}

const wasmSourceDirectory = 'node_modules/@tensorflow/tfjs-backend-wasm/dist';
for (const file of TFJS_WASM_FILES) {
  const vendored = path.posix.join('vendor/tfjs-wasm', file);
  if (!fs.existsSync(path.join(root, vendored)) || sha256(vendored) !== sha256(path.posix.join(wasmSourceDirectory, file))) {
    errors.push(`${vendored} does not match @tensorflow/tfjs-backend-wasm@${tfjsVersion}. Run bun run vendor:tfjs-wasm.`);
  }
}

if (fs.readFileSync(path.join(root, OUTPUT_PATH), 'utf8') !== generateBundledAssets(root)) {
  errors.push(`${OUTPUT_PATH} is out of date with models/manifest.json. Run bun run assets:generate.`);
}

for (const [name, binPath] of Object.entries(packageJson.bin ?? {})) {
  if (!fs.existsSync(path.join(root, binPath)) || !publishedFileEntries.has(path.posix.normalize(binPath).split('/')[0])) {
    errors.push(`package.json bin '${name}' points at ${binPath}, which is missing or not in files.`);
  }
}

if (errors.length) {
  console.error(errors.join('\n\n'));
  process.exitCode = 1;
}
