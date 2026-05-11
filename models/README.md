# Models

Browser-loadable ONNX assets and the default manifest for the SDK demos.

The manifest uses the runtime capability names:

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
    }
  ]
}
```

Applications can serve these files directly, copy them into their own public asset directory, or provide a custom manifest URL.

