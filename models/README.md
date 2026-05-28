# OpenFace Liveness Models

Browser-loadable ONNX assets used by the default model manifest. Model files are
fetched as static assets; they are not bundled into application JavaScript.

The default manifest is [`manifest.json`](./manifest.json).

## Default Assets

| Capability | File | Purpose |
| --- | --- | --- |
| `detector` | `face_detector_short_range_128x128_float32.onnx` | Face acquisition, crop proposal, recovery |
| `mesh` | `face_landmarks_detector_256x256_float32.onnx` | 478 landmarks for fit, anchor, pose, light regions |
| `blendshape` | `face_blendshapes_146x2_float32.onnx` | Expression scores such as `jawOpen` and `mouthClose` |
| `spoof` | `2.7_80x80_MiniFASNetV2.onnx` | Passive RGB anti-spoof classifier |
| `spoof` | `4_0_0_80x80_MiniFASNetV1SE.onnx` | Passive RGB anti-spoof classifier |

## Capabilities

### Google Face Detector

Short-range BlazeFace-style detector converted to ONNX. Used for face
acquisition, mesh crop proposal, recovery, and crop context for spoof/light
checks. Once landmarks exist, liveness fit uses landmark geometry, not the
detector box.

Reference: [MediaPipe Face Detector](https://ai.google.dev/edge/mediapipe/solutions/vision/face_detector)

### Google Face Landmarks

Face Mesh / Face Landmarker model converted to ONNX. Regresses `478` 3D
landmarks from a `256x256` cropped RGB face. Used for face fit, upper/mid-face
anchor stability, light sample placement, and face-geometry pose.

References:

- [MediaPipe Face Mesh](https://github.com/google-ai-edge/mediapipe/wiki/MediaPipe-Face-Mesh)
- [Face Mesh V2 model card](https://storage.googleapis.com/mediapipe-assets/Model%20Card%20MediaPipe%20Face%20Mesh%20V2.pdf)

### Google Face Geometry Metadata

Committed TypeScript constants derived from Google Face Geometry metadata. Used
for weighted Procrustes alignment from canonical face landmarks to runtime
landmarks, producing a `4x4` face transform and yaw/pitch/roll.

Reference: [MediaPipe Face Geometry](https://github.com/google-ai-edge/mediapipe/wiki/MediaPipe-Face-Mesh)

### Google Face Blendshapes

Blendshape V2 model converted to ONNX. Takes `146` selected landmarks and
outputs `52` expression coefficients. `open-face-liveness` uses `jawOpen` and
`mouthClose` for mouth-open and neutral-mouth liveness gating.

Reference: [Blendshape V2 model card](https://storage.googleapis.com/mediapipe-assets/Model%20Card%20Blendshape%20V2.pdf)

### Silent-Face Spoof Models

MiniFASNet RGB anti-spoofing classifiers converted to ONNX. Used for passive
real/spoof scoring on face crops. Upstream training uses Fourier-spectrum
auxiliary supervision, which can help learn print/screen replay artifacts,
display texture, and moire-like frequency patterns. Runtime does not explicitly
compute Fourier or moire features.

Reference: [Silent-Face-Anti-Spoofing](https://github.com/minivision-ai/Silent-Face-Anti-Spoofing)

### Light Challenge

Not an ONNX model. Uses screen color changes plus HSV/color sampling from face
regions to check active light response.

See: [`src/light`](../src/light)

## Custom Models

Applications can provide their own manifest URL and model overrides. Custom
models must match the input and output conventions expected by the corresponding
ONNX adapter.

## Notes

- Relative model URLs resolve from `models.baseUrl` or from the manifest URL directory.
- If `spoof` is enabled and no spoof model can be loaded, the session fails with a canonical `VerificationError`.
- Model attribution and license details are listed in [`../THIRD_PARTY_NOTICES.md`](../THIRD_PARTY_NOTICES.md).
