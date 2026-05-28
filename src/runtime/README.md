# Runtime Notes

`open-face-liveness` is a browser ESM package with normal runtime `dependencies`, not
`peerDependencies`.

## Runtime Dependencies

| Package | Declared version | Locked version | Update behavior | Purpose |
| --- | --- | --- | --- | --- |
| `onnxruntime-web` | `1.26.0` | `1.26.0` | Exact package spec | Runs browser ONNX sessions for detector, mesh, blendshape, and spoof models |
| `xstate` | `^5.31.1` | `5.31.1` | Caret range, pinned by `bun.lock` in this repo | Drives the verification session finite-state machine |

There is no root `peerDependencies` field today. Consumers should not need to
install `onnxruntime-web` or `xstate` separately unless they intentionally
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
- Custom model and runtime URLs can be provided through configuration.
