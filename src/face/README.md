# Face Math

This directory owns face acquisition, mesh projection, landmark smoothing, face
geometry, fit boxes, and stability anchors. Liveness policy lives in
[`../liveness/challenge.ts`](../liveness/challenge.ts), but it consumes the
geometry produced here.

The important rule is:

```txt
detector box -> crop/recovery only
mesh landmarks -> fit, anchor, pose, liveness math
blendshapes -> expression math
```

## Google References

We do not ship MediaPipe runtime. We port the small parts needed for this ONNX
runtime:

- [FaceGeometryFromLandmarksGraph](https://github.com/google-ai-edge/mediapipe/blob/master/mediapipe/tasks/cc/vision/face_geometry/face_geometry_from_landmarks_graph.cc#L738-L769): uses the first 468 landmarks and a top-left camera environment.
- [GeometryPipeline](https://github.com/google-ai-edge/mediapipe/blob/master/mediapipe/modules/face_geometry/libs/geometry_pipeline.cc#L1867-L1926): loads canonical mesh positions plus Procrustes landmark weights from metadata.
- [ProcrustesSolver](https://github.com/google-ai-edge/mediapipe/blob/master/mediapipe/modules/face_geometry/libs/procrustes_solver.cc): solves a weighted canonical-to-runtime transform.
- [LandmarksSmoothingCalculator OneEuro options](https://github.com/google-ai-edge/mediapipe/blob/master/mediapipe/calculators/util/landmarks_smoothing_calculator.proto#L518-L550): same filter family and starting knobs.
- [FaceBlendshapesGraph](https://github.com/google-ai-edge/mediapipe/blob/master/mediapipe/tasks/cc/vision/face_landmarker/face_blendshapes_graph.cc): converts face landmarks into blendshape classifications.

## Landmark Flow

Code: [`mesh.ts`](./mesh.ts)

The detector finds a coarse face box. We expand it into a square crop and run
the 256x256 face landmark ONNX model. The raw model coordinates are then
projected back into the video frame.

```ts
const projectedLandmarks = projectLandmarksToFrame(result.landmarks, crop);
const normalizedLandmarks = normalizeLandmarks(projectedLandmarks, frameWidth, frameHeight);
const smoothedLandmarks = landmarkSmoother.filter(normalizedLandmarks, nowSeconds);
const landmarks = denormalizeLandmarks(smoothedLandmarks, frameWidth, frameHeight);
```

Why normalize before smoothing: OneEuro should smooth comparable values across
different frame sizes. After smoothing, all downstream math uses frame-space
pixels again.

## Landmark Smoothing

Code: [`landmark-smoothing.ts`](./landmark-smoothing.ts)

We use a OneEuro-style low-pass filter per landmark coordinate:

```ts
derivative = (value - lastValue) / dt;
filteredDerivative = lowPass(derivative, derivativeCutoff);
cutoff = minCutoff + beta * abs(filteredDerivative);
filtered = lowPass(value, cutoff);
```

Current defaults:

```ts
minCutoff = 0.05;
beta = 80;
derivativeCutoff = 1.0;
```

This reduces jitter when the face is still, while allowing quick movement during
pan/pitch challenges. The filter resets when face/mesh presence is lost.

## Face Geometry Transform

Code: [`geometry.ts`](./geometry.ts),
[`geometry-metadata.ts`](./geometry-metadata.ts)

Google's metadata contains canonical face points and Procrustes weights. We
converted the tiny metadata basis into a committed TypeScript constant:

```ts
export const FACE_GEOMETRY_PROCRUSTES_BASIS = [
  { index: 4, weight: 0.0709, x: 0, y: -0.463, z: 7.587 },
  // ...
];
```

We estimate a canonical-to-runtime transform:

```txt
source = canonical weighted points
target = current smoothed landmarks
H = sum(weight * centeredSource * centeredTarget^T)
R = best rotation from Horn quaternion solve
scale = sum(weight * dot(centeredTarget, R * centeredSource)) /
        sum(weight * length(centeredSource)^2)
t = targetCentroid - scale * R * sourceCentroid
```

The result is a 4x4 transform matrix:

```ts
matrix = [
  scale * R00, scale * R01, scale * R02, tx,
  scale * R10, scale * R11, scale * R12, ty,
  scale * R20, scale * R21, scale * R22, tz,
  0, 0, 0, 1,
];
```

Pose angles are extracted from the rotation:

```ts
yaw = asin(-R20);
pitch = atan2(R21, R22);
roll = atan2(R10, R00);
```

These angles replace the old sparse landmark head-pose heuristic.

## Face Fit Box

Code: [`geometry.ts`](./geometry.ts),
[`fit.ts`](./fit.ts)

The face-fit box is used for UX prompts like `Move closer` and centering. It is
derived from stable outer/mid-face landmarks, not the detector box.

```ts
const bounds = getLandmarkBounds(landmarks, FIT_LANDMARKS);
const stableWidth = bounds.maxX - bounds.minX;
const width = stableWidth * (1 + FIT_WIDTH_PADDING_RATIO);
const height = width / FACE_GUIDE_ASPECT_RATIO;
const centerX = (bounds.minX + bounds.maxX) / 2;
```

Then [`validateFaceFit`](./fit.ts) compares this fit box to the guide:

```txt
widthFillRatio  = fit.width / guide.width
heightFillRatio = fit.height / guide.height
insideAreaRatio = overlap(fit, guide) / area(fit)
isAligned       = isCentered && isFaceLargeEnough
```

So `Move closer` now means the landmark-derived face box is too small, not that
the detector crop flickered.

## Anchor, Centering, And Stabilization

Code: [`geometry.ts`](./geometry.ts),
[`stability.ts`](./stability.ts),
[`../flow/verification-session.ts`](../flow/verification-session.ts)

The anchor box uses upper/mid-face landmarks only. It deliberately excludes jaw,
lips, and chin so `mouth_open` does not look like whole-face motion.

```ts
const bounds = getLandmarkBounds(landmarks, ANCHOR_LANDMARKS);
const padding = max(width, height) * ANCHOR_PADDING_RATIO;
```

The anchor position is normalized:

```ts
anchor = {
  x: (box.x + box.width / 2) / frameWidth,
  y: (box.y + box.height / 2) / frameHeight,
  width: box.width / frameWidth,
};
```

Drift compares the current anchor against the admitted reference:

```txt
deltaX = abs(current.x - reference.x)
deltaY = abs(current.y - reference.y)
distanceIncreaseRatio = (current.width - reference.width) / reference.width
```

Before liveness starts, the session requires:

```txt
faceFit.isAligned
anchor drift under threshold
pose variance under threshold
stable hold duration elapsed
```

## Liveness Metrics

Code: [`../liveness/challenge.ts`](../liveness/challenge.ts)

Each frame becomes:

```ts
mouthRatio = mesh.blendshapes.jawOpen;
mouthClose = mesh.blendshapes.mouthClose;
yaw = mesh.geometry.pose.yaw;
pitch = mesh.geometry.pose.pitch;
roll = mesh.geometry.pose.roll;
```

Mouth neutral uses both jaw-open and mouth-close:

```txt
closed =
  jawOpen < neutralMouthOpenRatio
  OR
  mouthClose >= 0.45 AND jawOpen < neutralMouthOpenRatio * 1.5
```

## Neutral Pose

Code: [`../liveness/challenge.ts`](../liveness/challenge.ts)

Before the first challenge, the user must face the camera in absolute terms:

```txt
abs(yaw)   <= neutralAbsoluteYawLimit
abs(pitch) <= neutralAbsolutePitchLimit
abs(roll)  <= neutralAbsoluteRollLimit
mouth is neutral
```

After a stable hold, we capture:

```ts
neutralPoseReference = currentPose;
pendingChallengeStart = { start: currentPose, startedAt: now };
```

Later neutral checks compare against that captured pose, not against zero. This
lets the UX ask the user to return to *their* centered pose between challenges.

## Active Drift

Code: [`../liveness/challenge.ts`](../liveness/challenge.ts)

During a challenge, active positioning is intentionally looser than admission.
The user is supposed to move their head, so we do not keep enforcing the same
strict center gate.

```txt
pan challenge: allow relaxed center, check anchor drift
pitch challenge: allow face-fit motion, check anchor drift
mouth challenge: require fit and anchor stability
```

Distance drift still matters:

```txt
abs(distanceIncreaseRatio) > activeDistanceIncreaseThreshold -> recenter
deltaX > activeMovementThreshold -> recenter
deltaY > activeVerticalMovementThreshold -> recenter
```

## Challenge Math

Code: [`../liveness/challenge.ts`](../liveness/challenge.ts)

All head challenges compare the current transform pose to the neutral pose
captured at challenge start.

```txt
yawDeltaLimit   = challengeYawLimit - neutralAbsoluteYawLimit
pitchDeltaLimit = challengePitchLimit - neutralAbsolutePitchLimit
```

| Challenge | Success condition | Guard rails |
| --- | --- | --- |
| `head_pan_left` | `startYaw - yaw >= yawDeltaLimit` | pitch/roll near start, mouth closed |
| `head_pan_right` | `yaw - startYaw >= yawDeltaLimit` | pitch/roll near start, mouth closed |
| `head_pitch_up` | `startPitch - pitch >= pitchDeltaLimit` | yaw/roll near start, mouth closed |
| `head_pitch_down` | `pitch - startPitch >= pitchDeltaLimit` | yaw/roll near start, mouth closed |
| `mouth_open` | `jawOpen >= challengeMouthOpenRatio` | yaw/pitch/roll near start, `mouthClose <= 0.35` |

Each success must dwell for the configured challenge dwell time before the step
is completed.

## Debug Overlay Meaning

Code: [`../draw/diagnostics.ts`](../draw/diagnostics.ts)

When debug overlay is on:

```txt
green/cyan rectangle = landmark fit box used for UX face-fit decisions
blue rectangle       = upper/mid-face anchor used for stability/drift
white dots           = smoothed mesh landmarks
pose label           = geometry yaw/pitch/roll
yellow dashed box    = detector box, only shown when no fit box exists
```

Detector still exists, but only for acquisition, mesh crop proposal, recovery,
spoof, and light helpers. It is not the source of truth for liveness face fit.
