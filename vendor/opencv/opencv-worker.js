let cvModule = null;
let cvLoadPromise = null;

function getErrorMessage(error) {
  return error?.message || String(error || "unknown error");
}

function assertOpenCvReady(candidate) {
  if (
    !candidate ||
    typeof candidate.Mat !== "function" ||
    typeof candidate.cvtColor !== "function" ||
    typeof candidate.mean !== "function" ||
    typeof candidate.matFromImageData !== "function" ||
    !Number.isFinite(candidate.COLOR_RGBA2RGB) ||
    !Number.isFinite(candidate.COLOR_RGB2HSV)
  ) {
    throw new Error("OpenCV worker loaded without required HSV APIs.");
  }
  return candidate;
}

function loadOpenCv() {
  if (cvModule) {
    return Promise.resolve(true);
  }
  if (cvLoadPromise) {
    return cvLoadPromise;
  }

  self.Module = {
    locateFile(path) {
      if (String(path).includes("opencv.wasm")) {
        return new URL("./opencv_js.wasm", self.location.href).href;
      }
      return path;
    },
    printErr(message) {
      console.warn("OpenCV.js worker:", message);
    }
  };
  Module = self.Module;

  cvLoadPromise = new Promise((resolve, reject) => {
    try {
      importScripts("./opencv.js");
      const factoryOrModule = self.cv;
      const moduleCandidate =
        typeof factoryOrModule === "function" ? factoryOrModule() : factoryOrModule;
      if (moduleCandidate && typeof moduleCandidate.then === "function") {
        moduleCandidate.then((ready) => {
          resolve({ module: ready });
        }, reject);
      } else {
        resolve({ module: moduleCandidate });
      }
    } catch (error) {
      reject(error);
    }
  }).then(({ module }) => {
    cvModule = assertOpenCvReady(module);
    return true;
  });

  return cvLoadPromise;
}

function sampleRegions(regions) {
  const cv = assertOpenCvReady(cvModule);
  let sampledPixels = 0;
  let redTotal = 0;
  let greenTotal = 0;
  let blueTotal = 0;
  let hueSinTotal = 0;
  let hueCosTotal = 0;
  let saturationTotal = 0;
  let valueTotal = 0;

  for (const region of regions || []) {
    if (!region?.width || !region?.height || !region?.data) {
      continue;
    }

    let rgbaMat = null;
    let rgbMat = null;
    let hsvMat = null;
    try {
      const imageData = new ImageData(
        new Uint8ClampedArray(region.data),
        region.width,
        region.height
      );
      rgbaMat = cv.matFromImageData(imageData);
      rgbMat = new cv.Mat();
      hsvMat = new cv.Mat();
      cv.cvtColor(rgbaMat, rgbMat, cv.COLOR_RGBA2RGB);
      cv.cvtColor(rgbMat, hsvMat, cv.COLOR_RGB2HSV);

      const rgbMean = cv.mean(rgbaMat);
      const data = hsvMat.data;
      const pixelCount = region.width * region.height;
      sampledPixels += pixelCount;
      redTotal += rgbMean[0] * pixelCount;
      greenTotal += rgbMean[1] * pixelCount;
      blueTotal += rgbMean[2] * pixelCount;

      for (let index = 0; index < data.length; index += 3) {
        const hueOpenCv = data[index + 0];
        const hueRadians = (hueOpenCv * 2 * Math.PI) / 180;
        hueSinTotal += Math.sin(hueRadians);
        hueCosTotal += Math.cos(hueRadians);
        saturationTotal += data[index + 1];
        valueTotal += data[index + 2];
      }
    } finally {
      if (hsvMat) {
        hsvMat.delete();
      }
      if (rgbMat) {
        rgbMat.delete();
      }
      if (rgbaMat) {
        rgbaMat.delete();
      }
    }
  }

  return {
    sampledPixels,
    redTotal,
    greenTotal,
    blueTotal,
    hueSinTotal,
    hueCosTotal,
    saturationTotal,
    valueTotal
  };
}

self.addEventListener("message", async (event) => {
  const { id, type, payload } = event.data || {};
  if (!id) {
    return;
  }

  try {
    if (type === "load") {
      await loadOpenCv(payload);
      self.postMessage({
        id,
        ok: true,
        result: {
          status: "ready",
          rgba2rgb: cvModule.COLOR_RGBA2RGB,
          rgb2hsv: cvModule.COLOR_RGB2HSV
        }
      });
      return;
    }

    if (type === "sample") {
      await loadOpenCv(payload);
      self.postMessage({
        id,
        ok: true,
        result: sampleRegions(payload?.regions || [])
      });
      return;
    }

    throw new Error(`Unsupported OpenCV worker request: ${type}`);
  } catch (error) {
    self.postMessage({
      id,
      ok: false,
      error: getErrorMessage(error)
    });
  }
});
