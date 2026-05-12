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
      "url": "face_detection_front_128x128_float32_opt.onnx"
    },
    {
      "id": "face-mesh-192-post",
      "capability": "mesh",
      "format": "onnx",
      "required": true,
      "url": "face_mesh_192x192_post.onnx"
    },
    {
      "id": "silent-face-minifasnet-v2-2.7",
      "capability": "spoof",
      "format": "onnx",
      "required": false,
      "url": "2.7_80x80_MiniFASNetV2.onnx"
    },
    {
      "id": "silent-face-minifasnet-v1se-4.0",
      "capability": "spoof",
      "format": "onnx",
      "required": false,
      "url": "4_0_0_80x80_MiniFASNetV1SE.onnx"
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
- `url`: browser-fetchable model URL, usually relative to `models.baseUrl`

## Capabilities

- `detector`: face detector model used before mesh, fit, liveness, light, and spoof checks
- `mesh`: face landmark model used for readiness, movement metrics, and diagnostics
- `spoof`: optional presentation-attack scoring models
- `liveness`: reserved capability for liveness-specific model assets
- `light`: reserved capability for light-specific model assets

The current default runtime requires `detector` and `mesh`. Spoof models are
loaded when the `spoof` check is enabled.

## Usage

Serve this directory as public static assets, for example under
`/web-verify/models/`:

```txt
/web-verify/models/manifest.json
/web-verify/models/face_detection_front_128x128_float32_opt.onnx
/web-verify/models/face_mesh_192x192_post.onnx
/web-verify/models/2.7_80x80_MiniFASNetV2.onnx
/web-verify/models/4_0_0_80x80_MiniFASNetV1SE.onnx
```

Then point the client at the manifest:

```ts
import { createWebVerifyClient } from 'web-verify';

const verifier = createWebVerifyClient({
  models: {
    baseUrl: '/web-verify/models/',
    manifestUrl: '/web-verify/models/manifest.json',
  },
});
```

Or provide the manifest for a single session:

```ts
const result = await verifier.start({
  video,
  models: {
    baseUrl: '/web-verify/models/',
    manifestUrl: '/web-verify/models/manifest.json',
  },
});
```

## Custom Models

Applications can provide their own manifest URL:

```ts
const verifier = createWebVerifyClient({
  models: {
    baseUrl: '/assets/web-verify/',
    manifestUrl: '/assets/web-verify/manifest.v1.json',
  },
});
```

Model specs are resolved at runtime and loaded through the ONNX adapters. Custom
models must match the input and output conventions expected by the corresponding
adapter.

## Notes

- Relative model URLs resolve from `models.baseUrl` or from the manifest URL directory.
- Absolute paths are still relative to the site origin.
- Model files should be served with normal static-file caching.
- Model attribution and license details are listed in `../THIRD_PARTY_NOTICES.md`.
- If `spoof` is enabled and no spoof model can be loaded, the session fails with a canonical `VerificationError`.
- Light checks also require OpenCV worker assets from `/web-verify/vendor/opencv/` unless a custom asset base or worker URL is configured.
