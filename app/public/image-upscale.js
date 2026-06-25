/*
 * 文件开头说明：本文件负责“商品图高清放大”的浏览器本地处理逻辑。
 * 当前工具优先服务亚马逊商品图，采用保守 Canvas 放大和轻微增强，避免白底、边缘和真实材质被过度处理。
 */

const upscaleState = {
  fileName: "product",
  image: null,
  objectUrl: "",
  outputBlobUrl: ""
};

const enhanceProfiles = {
  soft: { label: "轻微增强", contrast: 1.02, sharpen: 0.08 },
  balanced: { label: "标准增强", contrast: 1.04, sharpen: 0.14 },
  sharp: { label: "偏锐增强", contrast: 1.06, sharpen: 0.22 }
};

function getUpscaleNodes() {
  return {
    input: document.querySelector("#upscaleInput"),
    target: document.querySelector("#upscaleTarget"),
    enhance: document.querySelector("#upscaleEnhance"),
    protectWhite: document.querySelector("#upscaleProtectWhite"),
    run: document.querySelector("#upscaleRun"),
    download: document.querySelector("#upscaleDownload"),
    status: document.querySelector("#upscaleStatus"),
    meta: document.querySelector("#upscaleMeta"),
    originalPreview: document.querySelector("#upscaleOriginalPreview"),
    originalPlaceholder: document.querySelector("#upscaleOriginalPlaceholder"),
    resultCanvas: document.querySelector("#upscaleCanvas"),
    resultPlaceholder: document.querySelector("#upscaleResultPlaceholder")
  };
}

function setUpscaleStatus(message, tone = "idle") {
  const status = document.querySelector("#upscaleStatus");
  if (!status) return;
  status.textContent = message;
  status.dataset.tone = tone;
}

function formatPixels(width, height) {
  return `${Math.round(width)} x ${Math.round(height)} px`;
}

function cleanFileBaseName(name) {
  return String(name || "product")
    .replace(/\.[^.]+$/, "")
    .replace(/[^a-zA-Z0-9\u4e00-\u9fa5_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "product";
}

function calculateTargetSize(width, height, target) {
  if (target === "2x" || target === "4x") {
    const scale = Number(target.replace("x", ""));
    return {
      width: Math.round(width * scale),
      height: Math.round(height * scale),
      scale
    };
  }

  const longEdge = Number(target);
  const scale = longEdge / Math.max(width, height);
  return {
    width: Math.round(width * scale),
    height: Math.round(height * scale),
    scale
  };
}

function createCanvas(width, height) {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  return canvas;
}

function drawImageCoveringTransparentPixels(context, width, height) {
  context.globalCompositeOperation = "destination-over";
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);
  context.globalCompositeOperation = "source-over";
}

function drawUpscaledImage(image, targetWidth, targetHeight) {
  let current = createCanvas(image.naturalWidth, image.naturalHeight);
  let currentContext = current.getContext("2d", { willReadFrequently: true });
  currentContext.imageSmoothingEnabled = true;
  currentContext.imageSmoothingQuality = "high";
  currentContext.drawImage(image, 0, 0);
  drawImageCoveringTransparentPixels(currentContext, current.width, current.height);

  // 分步放大比一次性拉伸更稳，能减少商品边缘锯齿和明显糊边。
  while (current.width * 1.5 < targetWidth || current.height * 1.5 < targetHeight) {
    const nextWidth = Math.min(targetWidth, Math.round(current.width * 1.5));
    const nextHeight = Math.min(targetHeight, Math.round(current.height * 1.5));
    const next = createCanvas(nextWidth, nextHeight);
    const nextContext = next.getContext("2d", { willReadFrequently: true });
    nextContext.imageSmoothingEnabled = true;
    nextContext.imageSmoothingQuality = "high";
    nextContext.drawImage(current, 0, 0, nextWidth, nextHeight);
    current = next;
    currentContext = nextContext;
  }

  if (current.width !== targetWidth || current.height !== targetHeight) {
    const finalCanvas = createCanvas(targetWidth, targetHeight);
    const finalContext = finalCanvas.getContext("2d", { willReadFrequently: true });
    finalContext.imageSmoothingEnabled = true;
    finalContext.imageSmoothingQuality = "high";
    finalContext.drawImage(current, 0, 0, targetWidth, targetHeight);
    current = finalCanvas;
  }

  return current;
}

function protectWhiteBackground(data, index) {
  const red = data[index];
  const green = data[index + 1];
  const blue = data[index + 2];
  const alpha = data[index + 3];

  if (alpha < 255 || (red > 236 && green > 236 && blue > 236 && Math.max(red, green, blue) - Math.min(red, green, blue) < 12)) {
    data[index] = 255;
    data[index + 1] = 255;
    data[index + 2] = 255;
    data[index + 3] = 255;
    return true;
  }

  return false;
}

function applyConservativeEnhancement(canvas, profile, shouldProtectWhite) {
  const context = canvas.getContext("2d", { willReadFrequently: true });
  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  const { data } = imageData;
  const original = new Uint8ClampedArray(data);
  const contrast = profile.contrast;
  const sharpen = profile.sharpen;

  for (let index = 0; index < data.length; index += 4) {
    if (shouldProtectWhite && protectWhiteBackground(data, index)) {
      continue;
    }

    for (let channel = 0; channel < 3; channel += 1) {
      const value = data[index + channel];
      data[index + channel] = Math.max(0, Math.min(255, (value - 128) * contrast + 128));
    }
  }

  if (sharpen > 0) {
    const width = canvas.width;
    const height = canvas.height;
    for (let y = 1; y < height - 1; y += 1) {
      for (let x = 1; x < width - 1; x += 1) {
        const index = (y * width + x) * 4;
        if (shouldProtectWhite && data[index] === 255 && data[index + 1] === 255 && data[index + 2] === 255) {
          continue;
        }

        for (let channel = 0; channel < 3; channel += 1) {
          const center = original[index + channel];
          const top = original[((y - 1) * width + x) * 4 + channel];
          const bottom = original[((y + 1) * width + x) * 4 + channel];
          const left = original[(y * width + x - 1) * 4 + channel];
          const right = original[(y * width + x + 1) * 4 + channel];
          const blur = (top + bottom + left + right) / 4;
          data[index + channel] = Math.max(0, Math.min(255, center + (center - blur) * sharpen));
        }
      }
    }
  }

  context.putImageData(imageData, 0, 0);
}

function downloadUpscaledImage(canvas, fileName, link) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("图片导出失败，请换一张图片重试。"));
        return;
      }

      if (upscaleState.outputBlobUrl) {
        URL.revokeObjectURL(upscaleState.outputBlobUrl);
      }
      upscaleState.outputBlobUrl = URL.createObjectURL(blob);
      link.href = upscaleState.outputBlobUrl;
      link.download = `${fileName}-upscaled.png`;
      link.classList.remove("disabled");
      resolve(blob);
    }, "image/png");
  });
}

function loadImageFromFile(file) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const objectUrl = URL.createObjectURL(file);

    image.onload = () => resolve({ image, objectUrl });
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("图片读取失败，请确认文件是 PNG、JPG 或 WebP。"));
    };
    image.src = objectUrl;
  });
}

async function handleUpscaleFile(event) {
  const nodes = getUpscaleNodes();
  const file = event.target.files?.[0];
  if (!file) return;

  if (!file.type.startsWith("image/")) {
    setUpscaleStatus("请选择图片文件", "error");
    return;
  }

  try {
    setUpscaleStatus("正在读取原图", "working");
    const { image, objectUrl } = await loadImageFromFile(file);
    if (upscaleState.objectUrl) {
      URL.revokeObjectURL(upscaleState.objectUrl);
    }

    upscaleState.fileName = cleanFileBaseName(file.name);
    upscaleState.image = image;
    upscaleState.objectUrl = objectUrl;

    nodes.originalPreview.src = objectUrl;
    nodes.originalPreview.classList.add("is-visible");
    nodes.originalPlaceholder.hidden = true;
    nodes.resultPlaceholder.hidden = false;
    nodes.resultCanvas.classList.remove("is-visible");
    nodes.download.classList.add("disabled");
    nodes.meta.textContent = `原图尺寸：${formatPixels(image.naturalWidth, image.naturalHeight)}。建议先用 2x 检查边缘和文字，再导出 4K。`;
    setUpscaleStatus("原图已载入", "ready");
  } catch (error) {
    setUpscaleStatus(error.message, "error");
  }
}

async function processUpscale() {
  const nodes = getUpscaleNodes();
  const image = upscaleState.image;

  if (!image) {
    setUpscaleStatus("请先上传商品图", "error");
    return;
  }

  const targetSize = calculateTargetSize(image.naturalWidth, image.naturalHeight, nodes.target.value);
  if (targetSize.width > 5200 || targetSize.height > 5200) {
    setUpscaleStatus("目标尺寸过大，请先选择 2x 或 4096 长边", "error");
    return;
  }

  try {
    setUpscaleStatus("正在本地生成高清图", "working");
    nodes.run.disabled = true;
    nodes.download.classList.add("disabled");

    await new Promise((resolve) => requestAnimationFrame(resolve));
    const outputCanvas = drawUpscaledImage(image, targetSize.width, targetSize.height);
    const profile = enhanceProfiles[nodes.enhance.value] || enhanceProfiles.balanced;
    applyConservativeEnhancement(outputCanvas, profile, nodes.protectWhite.checked);

    nodes.resultCanvas.width = outputCanvas.width;
    nodes.resultCanvas.height = outputCanvas.height;
    const resultContext = nodes.resultCanvas.getContext("2d");
    resultContext.clearRect(0, 0, nodes.resultCanvas.width, nodes.resultCanvas.height);
    resultContext.drawImage(outputCanvas, 0, 0);
    nodes.resultCanvas.classList.add("is-visible");
    nodes.resultPlaceholder.hidden = true;

    const blob = await downloadUpscaledImage(outputCanvas, upscaleState.fileName, nodes.download);
    nodes.meta.textContent = [
      `输出尺寸：${formatPixels(outputCanvas.width, outputCanvas.height)}`,
      `放大倍率：${targetSize.scale.toFixed(2)}x`,
      `模式：${profile.label}`,
      `文件约 ${(blob.size / 1024 / 1024).toFixed(2)} MB`
    ].join("；");
    setUpscaleStatus("高清图已生成", "done");
  } catch (error) {
    setUpscaleStatus(error.message, "error");
  } finally {
    nodes.run.disabled = false;
  }
}

function initImageUpscaleTool() {
  const nodes = getUpscaleNodes();
  if (!nodes.input || !nodes.run) {
    return;
  }

  setUpscaleStatus("等待上传图片");
  nodes.input.addEventListener("change", handleUpscaleFile);
  nodes.run.addEventListener("click", processUpscale);
}

initImageUpscaleTool();
