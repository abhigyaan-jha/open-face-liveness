# Web Verify Models

Browser-loadable ONNX assets and the default model manifest used by
`web-verify` runtime loading.

Models are not imported by JavaScript bundlers. They are fetched by the browser
from the manifest URL supplied to `createWebVerifyClient()` or `verifier.start()`.

## Manifest

Default manifest:

```json
{
  "version": 1,
  "models": [
    {
      "id": "face-detector-front-128",
      "capability": "detector",
      "format": "onnx",
      "required": true,
      "url": "/models/face_detection_front_128x128_float32_opt.onnx"
    },
    {
      "id": "face-mesh-192-post",
      "capability": "mesh",
      "format": "onnx",
      "required": true,
      "url": "/models/face_mesh_192x192_post.onnx"
    },
    {
      "id": "silent-face-minifasnet-v2-2.7",
      "capability": "spoof",
      "format": "onnx",
      "required": false,
      "url": "/models/2.7_80x80_MiniFASNetV2.onnx"
    },
    {
      "id": "silent-face-minifasnet-v1se-4.0",
      "capability": "spoof",
      "format": "onnx",
      "required": false,
      "url": "/models/4_0_0_80x80_MiniFASNetV1SE.onnx"
    }
  ]
}
```

Manifest fields:

- `version`: manifest schema version
- `models`: list of browser-loadable model specs
- `id`: stable model identifier
- `capability`: runtime capability, one of `detector`, `mesh`, `spoof`, `liveness`, or `light`
- `format`: currently `onnx`
- `required`: whether the model is required for the configured runtime
- `url`: browser-fetchable model URL

## Capabilities

- `detector`: face detector model used before mesh, fit, liveness, light, and spoof checks
- `mesh`: face landmark model used for readiness, movement metrics, and diagnostics
- `spoof`: optional presentation-attack scoring models
- `liveness`: reserved capability for liveness-specific model assets
- `light`: reserved capability for light-specific model assets

The current default runtime requires `detector` and `mesh`. Spoof models are
loaded when the `spoof` check is enabled.

## Usage

Serve this directory as public static assets:

```txt
/models/manifest.json
/models/face_detection_front_128x128_float32_opt.onnx
/models/face_mesh_192x192_post.onnx
/models/2.7_80x80_MiniFASNetV2.onnx
/models/4_0_0_80x80_MiniFASNetV1SE.onnx
```

Then point the client at the manifest:

```ts
import { createWebVerifyClient } from 'web-verify';

const verifier = createWebVerifyClient({
  models: {
    manifestUrl: '/models/manifest.json',
  },
});
```

Or provide the manifest for a single session:

```ts
const result = await verifier.start({
  video,
  models: {
    manifestUrl: '/models/manifest.json',
  },
});
```

## Custom Models

Applications can provide their own manifest URL:

```ts
const verifier = createWebVerifyClient({
  models: {
    manifestUrl: '/assets/web-verify/manifest.v1.json',
  },
});
```

Model specs are resolved at runtime and loaded through the ONNX adapters. Custom
models must match the input and output conventions expected by the corresponding
adapter.

## Notes

- URLs are resolved by the browser, so absolute paths are relative to the site origin.
- Model files should be served with normal static-file caching.
- If `spoof` is enabled and no spoof model can be loaded, the session fails with a canonical `VerificationError`.
- Light checks also require OpenCV worker assets from `vendor/opencv/` unless a custom worker URL is configured.
