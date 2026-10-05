# Runtime Notes

`open-face-liveness` is a browser ESM package with normal runtime `dependencies`, not
`peerDependencies`.

## Runtime Dependencies

| Package | Declared version | Locked version | Update behavior | Purpose |
| --- | --- | --- | --- | --- |
| `@tensorflow/tfjs-core` | `4.22.0` | `4.22.0` | Exact package spec | TensorFlow.js tensors and engine |
| `@tensorflow/tfjs-converter` | `4.22.0` | `4.22.0` | Exact package spec | Loads and runs the detector, mesh, blendshape, and spoof graph models |
| `@tensorflow/tfjs-backend-wasm` | `4.22.0` | `4.22.0` | Exact package spec | Wasm backend that executes the models |
| `xstate` | `^5.31.1` | `5.31.1` | Caret range, pinned by `bun.lock` in this repo | Drives the verification session finite-state machine |

There is no root `peerDependencies` field today. Consumers should not need to
install the TensorFlow.js packages or `xstate` separately unless they intentionally
override dependency resolution.

## Development Dependencies

| Package | Declared version | Locked version | Purpose |
| --- | --- | --- | --- |
| `@eslint/js` | `^10.0.1` | `10.0.1` | ESLint JavaScript rules |
| `@types/bun` | `^1.3.13` | `1.3.13` | Bun type definitions |
| `@types/react` | `^19.2.14` | `19.2.14` | React type definitions for the demo |
| `@types/react-dom` | `^19.2.3` | `19.2.3` | React DOM type definitions for the demo |
| `@vitejs/plugin-react` | `^6.0.1` | `6.0.1` | Vite React plugin for the demo |
| `eslint` | `^10.3.0` | `10.3.0` | Linting |
| `eslint-plugin-react-hooks` | `^7.1.1` | `7.1.1` | React hooks linting for the demo |
| `globals` | `^17.6.0` | `17.6.0` | Shared lint globals |
| `lucide-react` | `^1.14.0` | `1.14.0` | Demo UI icons |
| `react` | `^19.2.6` | `19.2.6` | Demo UI runtime |
| `react-dom` | `^19.2.6` | `19.2.6` | Demo UI DOM renderer |
| `typescript` | `^5.9.3` | `5.9.3` | Type-checking and declaration output |
| `typescript-eslint` | `^8.59.3` | `8.59.3` | TypeScript-aware ESLint integration |
| `vite` | `^8.0.12` | `8.0.12` | Local browser demo dev server |

## Runtime Assets

- Model assets: `models/`
- OpenCV worker assets: `vendor/opencv/`
- TensorFlow.js wasm binaries: `vendor/tfjs-wasm/`, loaded from `/open-face-liveness/vendor/tfjs-wasm/` unless `models.tfjsWasmBaseUrl` is set.
  They are served from the app's own origin, so verification makes no third-party requests.
  `bun run vendor:tfjs-wasm` copies them from `@tensorflow/tfjs-backend-wasm`, and `bun run package:audit` fails if they drift.
- Custom model and runtime URLs can be provided through configuration.

## TensorFlow.js Backend

TensorFlow.js has one global engine per page.
`open-face-liveness` registers the wasm backend and makes it the active backend when models load.
If the host app also uses TensorFlow.js with another backend, such as WebGL, that app's work will run on wasm after verification starts.
If the host app initializes the wasm backend first, its wasm paths are kept and `models.tfjsWasmBaseUrl` is ignored.
The backend runs single-threaded, because threads need blob-URL workers that strict Content Security Policies block.

The TensorFlow.js packages are pinned to one exact version because the JS and wasm binaries are a matched set.
`bun run package:audit` enforces that pin.

## Model Integrity

Every manifest entry lists the SHA-256 of each file the model loads.
The loader fetches only listed files and rejects any whose bytes do not match, with the `models.integrity_failed` error code.
Hashing uses Web Crypto, which browsers only provide in secure contexts (HTTPS or localhost), the same requirement as camera access.
