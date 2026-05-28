import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

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

const onnxDependency = packageJson.dependencies?.['onnxruntime-web'];
const onnxVersion = typeof onnxDependency === 'string' && /^\d+\.\d+\.\d+$/.test(onnxDependency)
  ? onnxDependency
  : null;
const onnxAdapterSource = fs.readFileSync(path.join(root, 'src/onnx/adapters.ts'), 'utf8');
if (!onnxVersion) {
  errors.push('onnxruntime-web must be pinned to an exact version because its JS and wasm assets are a matched set.');
}

if (!onnxVersion || !onnxAdapterSource.includes(`onnxruntime-web@${onnxVersion}/dist/`)) {
  errors.push('DEFAULT_ONNX_WASM_BASE_URL must stay pinned to the onnxruntime-web dependency version.');
}

if (errors.length) {
  console.error(errors.join('\n\n'));
  process.exitCode = 1;
}
