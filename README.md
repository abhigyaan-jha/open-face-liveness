# Web Verify SDK

A browser verification library for face capture, liveness challenges, anti-spoof signals, light response checks, and verification flow orchestration.

This repository is intentionally private while the public API settles.

## Shape

```txt
src/web-verify.ts  main facade
src/config.ts      shared configuration
src/types.ts       shared runtime and verification types
src/runtime.ts     runtime barrel for low-level primitives
src/models.ts      model manifest and loader helpers
src/face/          face detection, mesh, and readiness modules
src/flow/          verification state machine/session flow
src/liveness/      active challenge checks and liveness scoring
src/light/         light response checks
src/spoof/         presentation-attack signal checks
src/onnx/          ONNX adapter helpers
src/opencv/        OpenCV asset helpers
src/capture/       camera and frame capture helpers
src/draw/          guides and diagnostics overlays
models/            default ONNX model manifest and assets
vendor/opencv/     OpenCV worker assets used by the light check
```

## Intended API

```ts
import { WebVerify } from 'web-verify';

const verify = new WebVerify({
  models: { manifestUrl: '/models/manifest.json' },
  checks: { face: true, liveness: true, spoof: true, light: true },
});

await verify.load();
const result = await verify.verify(video);
```

## Scripts

```sh
bun install
bun run typecheck
bun run build
```
