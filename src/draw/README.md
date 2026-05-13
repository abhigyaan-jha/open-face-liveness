# Diagnostics Overlay

This module renders debug-only visuals over the camera feed. It does not own
face or liveness decisions; it only displays the current diagnostics snapshot.

## Overlay Legend

Code: [`diagnostics.ts`](./diagnostics.ts)

When debug overlay is on:

```txt
green rectangle      = aligned landmark fit box
cyan rectangle       = landmark fit box that is not currently aligned
blue rectangle       = upper/mid-face anchor used for stability/drift
white dots           = smoothed mesh landmarks
pose label           = geometry yaw/pitch/roll
yellow dashed box    = detector box, only shown when no fit box exists
```

The detector still exists, but only for acquisition, mesh crop proposal,
recovery, spoof, and light helpers. It is not the source of truth for liveness
face fit once mesh geometry is available.
