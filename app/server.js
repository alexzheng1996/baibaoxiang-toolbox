/**
 * 文件开头说明：本文件负责启动百宝箱本地服务、托管静态页面、代理公开汇率接口，并提供本机图片批量 2K 处理与 macOS 选目录辅助接口。
 * 汇率接口只用于日常运营估算；图片批量接口只处理用户明确提交的本地文件夹，并把 AI 结果以 `2K_` 前缀保存回原目录。
 * 默认批量 2K 按升级后的 local-realesrgan-product-upscale skill 执行：Real-ESRGAN 原生 4x、tile 2048、再缩回 2048。
 * 选目录接口只返回本机路径，不会读取图片；真正处理仍需用户手动点击批量 2K。
 */

const fs = require("node:fs/promises");
const path = require("node:path");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const express = require("express");
const QRCode = require("qrcode");

const DEFAULT_PORT = 2332;
const PROJECT_ROOT = path.join(__dirname, "..");
const PUBLIC_DIR = path.join(__dirname, "public");
const REALESRGAN_DIR = path.join(PROJECT_ROOT, "tools", "realesrgan-ncnn-vulkan");
const REALESRGAN_BIN = path.join(REALESRGAN_DIR, "realesrgan-ncnn-vulkan");
const REALESRGAN_MODEL_DIR = path.join(REALESRGAN_DIR, "models");
const REALESRGAN_SKILL_SCRIPT =
  "/Users/alexwork/.codex/skills/local-realesrgan-product-upscale/scripts/run_upscale_benchmark.py";
const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp"]);
const OUTPUT_PREFIX = "2K_";
const OUTPUT_EXTENSION = ".jpg";
const OUTPUT_FORMAT = "jpeg";
const OUTPUT_JPEG_QUALITY = "88";
const OUTPUT_SIZE_LIMIT_BYTES = 1.2 * 1024 * 1024;
const DEFAULT_AI_MODEL = "realesrgan-x4plus";
const DEFAULT_TILE_SIZE = 2048;
const SENSITIVE_IMAGE_MARKERS = [/OpenAI/i, /Media Service/i, /prompt/i, /workflow/i, /C2PA/i];
const execFileAsync = promisify(execFile);

const FALLBACK_RATES_BY_USD = {
  USD: 1,
  CNY: 6.7857,
  EUR: 0.87781,
  GBP: 0.75667,
  JPY: 161.53,
  CAD: 1.4187,
  AUD: 1.4416,
  HKD: 7.84,
  SGD: 1.2959,
  MXN: 18.88,
  AED: 3.6725
};

function normalizeCurrencyList(value) {
  if (!value) {
    return ["CNY", "EUR", "GBP", "JPY", "CAD", "AUD", "HKD", "SGD"];
  }

  return String(value)
    .split(",")
    .map((item) => item.trim().toUpperCase())
    .filter(Boolean);
}

function getFallbackRates(base, symbols) {
  const safeBase = FALLBACK_RATES_BY_USD[base] ? base : "USD";
  const baseRate = FALLBACK_RATES_BY_USD[safeBase];

  return symbols.reduce((rates, symbol) => {
    const symbolRate = FALLBACK_RATES_BY_USD[symbol];
    if (symbolRate) {
      rates[symbol] = Number((symbolRate / baseRate).toFixed(6));
    }
    return rates;
  }, {});
}

function isSupportedImage(fileName) {
  return IMAGE_EXTENSIONS.has(path.extname(fileName).toLowerCase());
}

function isGeneratedImage(fileName) {
  const name = path.basename(fileName).toLowerCase();
  return (
    name.startsWith(OUTPUT_PREFIX.toLowerCase()) ||
    name.includes("comparison") ||
    name.includes("benchmark") ||
    name.includes("_raw_") ||
    name.includes("_2k_realesrgan")
  );
}

async function listSourceImages(folderPath) {
  const entries = await fs.readdir(folderPath, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((name) => isSupportedImage(name) && !isGeneratedImage(name))
    .sort((a, b) => a.localeCompare(b, "zh-CN"))
    .map((name) => path.join(folderPath, name));
}

async function ensureDirectory(folderPath) {
  const trimmed = String(folderPath || "").trim();
  if (!trimmed) {
    const error = new Error("请输入本地图片文件夹路径。");
    error.statusCode = 400;
    throw error;
  }

  const resolved = path.resolve(trimmed);
  const stat = await fs.stat(resolved).catch(() => null);
  if (!stat?.isDirectory()) {
    const error = new Error("文件夹不存在或不是有效目录。");
    error.statusCode = 400;
    throw error;
  }
  return resolved;
}

async function pathExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function getUniqueOutputPath(sourcePath) {
  const folder = path.dirname(sourcePath);
  return getUniqueOutputPathWithPrefix(sourcePath, folder, OUTPUT_PREFIX);
}

async function getUniqueOutputPathWithPrefix(sourcePath, outputDir, outputPrefix) {
  const parsed = path.parse(sourcePath);
  const baseName = `${outputPrefix}${parsed.name}`;
  let candidate = path.join(outputDir, `${baseName}${OUTPUT_EXTENSION}`);
  let index = 2;

  while (await pathExists(candidate)) {
    candidate = path.join(outputDir, `${baseName}_${index}${OUTPUT_EXTENSION}`);
    index += 1;
  }

  return candidate;
}

async function readImageSize(filePath) {
  const { stdout } = await execFileAsync("sips", ["-g", "pixelWidth", "-g", "pixelHeight", filePath]);
  const width = Number(stdout.match(/pixelWidth:\s*(\d+)/)?.[1]);
  const height = Number(stdout.match(/pixelHeight:\s*(\d+)/)?.[1]);
  if (!Number.isFinite(width) || !Number.isFinite(height)) {
    throw new Error("无法读取图片尺寸。");
  }
  return { width, height };
}

function getResizeArgs(inputPath, outputPath, targetLongEdge) {
  return [
    "-Z",
    String(targetLongEdge),
    "-s",
    "format",
    OUTPUT_FORMAT,
    "-s",
    "formatOptions",
    OUTPUT_JPEG_QUALITY,
    inputPath,
    "--out",
    outputPath
  ];
}

function getImageUpscalePlan(size, targetLongEdge) {
  return {
    mode: "realesrgan-native-x4",
    reason: "skill-native-x4-then-resize",
    model: DEFAULT_AI_MODEL,
    tileSize: DEFAULT_TILE_SIZE,
    targetLongEdge: Number(targetLongEdge) || 2048,
    inputSize: size,
    usesScaleShortcut: false
  };
}

async function cleanImageMetadata({ outputPath }) {
  const cleanedPath = path.join(path.dirname(outputPath), `.${path.basename(outputPath, path.extname(outputPath))}.clean.jpg`);
  try {
    // sips 重新编码 JPG 时不会复制原始 OpenAI/C2PA/XMP 文本块，同时更适合控制商品图体积。
    await execFileAsync("sips", [
      "-s",
      "format",
      OUTPUT_FORMAT,
      "-s",
      "formatOptions",
      OUTPUT_JPEG_QUALITY,
      outputPath,
      "--out",
      cleanedPath
    ]);
    await fs.rename(cleanedPath, outputPath);
  } finally {
    await fs.rm(cleanedPath, { force: true });
  }
}

async function inspectOutputFile(outputPath) {
  const stat = await fs.stat(outputPath);
  const buffer = await fs.readFile(outputPath);
  const text = buffer.toString("latin1");
  const sensitiveMarkers = SENSITIVE_IMAGE_MARKERS.filter((pattern) => pattern.test(text)).map((pattern) =>
    pattern.source.replaceAll("\\", "")
  );

  return {
    fileSizeBytes: stat.size,
    underSizeLimit: stat.size <= OUTPUT_SIZE_LIMIT_BYTES,
    sensitiveMarkers
  };
}

function isFolderPickerCancelled(error) {
  const errorText = `${error.message || ""}\n${error.stderr || ""}\n${error.stdout || ""}`;
  return /-128|User canceled|canceled|cancelled|取消/i.test(errorText);
}

async function defaultFolderPicker() {
  if (process.platform !== "darwin") {
    const error = new Error("当前选择文件夹窗口只支持 macOS，本机可继续手动输入文件夹路径。");
    error.statusCode = 501;
    throw error;
  }

  try {
    const { stdout } = await execFileAsync("osascript", [
      "-e",
      'set selectedFolder to choose folder with prompt "请选择需要批量 2K 的图片文件夹"',
      "-e",
      "POSIX path of selectedFolder"
    ]);
    return stdout.trim() || null;
  } catch (error) {
    if (isFolderPickerCancelled(error)) {
      return null;
    }
    throw error;
  }
}

function parseSkillJsonRows(stdout) {
  return stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith("{") && line.endsWith("}"))
    .map((line) => JSON.parse(line));
}

function summarizeIntegrity(results) {
  return results.reduce(
    (summary, item) => {
      if (item.integrityStatus === "pass") summary.pass += 1;
      else if (item.integrityStatus === "review") summary.review += 1;
      else if (item.integrityStatus === "fail") summary.fail += 1;
      return summary;
    },
    { pass: 0, review: 0, fail: 0 }
  );
}

function normalizeSkillResult(row, sourceLookup, finalOutputPath) {
  const outputPath = finalOutputPath || path.resolve(String(row.output || ""));
  const sourcePath = sourceLookup.get(row.file) || "";
  const sensitiveMarkers = String(row.sensitive_markers || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  const outputSize = {
    width: Number(row.output_width) || 0,
    height: Number(row.output_height) || 0
  };
  const fileSizeBytes = Number.isFinite(Number(row.output_mb))
    ? Math.round(Number(row.output_mb) * 1024 * 1024)
    : 0;

  return {
    sourcePath,
    outputPath,
    status: "done",
    outputSize,
    fileSizeBytes,
    underSizeLimit: fileSizeBytes <= OUTPUT_SIZE_LIMIT_BYTES,
    metadataCleaned: sensitiveMarkers.length === 0,
    sensitiveMarkers,
    whiteBgEnabled: Boolean(row.white_bg_enabled),
    whiteBgRestoredPixels: Number(row.white_bg_restored_pixels) || 0,
    integrityStatus: String(row.integrity_status || "review"),
    integrityBboxShiftRatio: Number(row.integrity_bbox_shift_ratio) || 0,
    integrityBboxAreaRatio: Number(row.integrity_bbox_area_ratio) || 0,
    integrityLayoutDiffRatio: Number(row.integrity_layout_diff_ratio) || 0,
    aiSeconds: Number(row.ai_seconds) || 0,
    postSeconds: Number(row.post_seconds) || 0,
    totalSeconds: Number(row.total_seconds) || 0,
    message: "已按 Real-ESRGAN 原生 4x + tile 2048 + 缩回 2048 生成。"
  };
}

async function updateSkillReportPaths(report, outputPathMap) {
  if (!outputPathMap.size) return;

  if (report.jsonPath && (await pathExists(report.jsonPath))) {
    const rows = JSON.parse(await fs.readFile(report.jsonPath, "utf8"));
    const updatedRows = rows.map((row) => ({
      ...row,
      output: outputPathMap.get(row.output) || row.output
    }));
    await fs.writeFile(report.jsonPath, JSON.stringify(updatedRows, null, 2), "utf8");
  }

  if (report.csvPath && (await pathExists(report.csvPath))) {
    let csvText = await fs.readFile(report.csvPath, "utf8");
    for (const [oldPath, newPath] of outputPathMap.entries()) {
      csvText = csvText.split(oldPath).join(newPath);
    }
    await fs.writeFile(report.csvPath, csvText, "utf8");
  }
}

async function defaultImageBatchRunner({
  folderPath,
  sourcePaths,
  outputDir = folderPath,
  outputPrefix = OUTPUT_PREFIX,
  targetLongEdge,
  model = DEFAULT_AI_MODEL,
  tileSize = DEFAULT_TILE_SIZE,
  finalFormat = "jpeg",
  useNativeX4 = true
}) {
  if (!useNativeX4) {
    throw new Error("当前百宝箱批量 2K 只支持升级后 skill 的 Real-ESRGAN 原生 4x 流程。");
  }
  if (!sourcePaths.length) {
    return buildEmptyBatchPayload({ folderPath, outputDir, targetLongEdge, model, tileSize });
  }

  await fs.mkdir(outputDir, { recursive: true });

  // 调用已升级 skill 的脚本，避免重新实现白底保护、完整性检查和对比图生成逻辑。
  const args = [
    REALESRGAN_SKILL_SCRIPT,
    "--input-dir",
    folderPath,
    "--output-dir",
    outputDir,
    "--limit",
    String(sourcePaths.length),
    "--target",
    String(targetLongEdge),
    "--tile",
    String(tileSize),
    "--model",
    model,
    "--realesrgan-dir",
    REALESRGAN_DIR
  ];
  if (finalFormat === "jpeg") {
    args.push("--jpg");
  }

  const { stdout } = await execFileAsync("python3", args, {
    maxBuffer: 20 * 1024 * 1024
  });
  const sourceLookup = new Map(sourcePaths.map((item) => [path.basename(item), item]));
  const rows = parseSkillJsonRows(stdout);
  const results = [];
  const report = {
    csvPath: path.join(outputDir, "benchmark_realesrgan_x4_tile2048.csv"),
    jsonPath: path.join(outputDir, "benchmark_realesrgan_x4_tile2048.json"),
    comparisonPath: path.join(outputDir, "comparison_realesrgan_x4_tile2048.jpg")
  };
  const outputPathMap = new Map();

  for (const row of rows) {
    const generatedOutput = path.resolve(String(row.output || ""));
    const sourcePath = sourceLookup.get(row.file);
    const finalOutputPath = sourcePath
      ? await getUniqueOutputPathWithPrefix(sourcePath, outputDir, outputPrefix)
      : generatedOutput;

    if (generatedOutput && generatedOutput !== finalOutputPath && (await pathExists(generatedOutput))) {
      await fs.rename(generatedOutput, finalOutputPath);
      outputPathMap.set(generatedOutput, finalOutputPath);
    }

    row.output = finalOutputPath;
    results.push(normalizeSkillResult(row, sourceLookup, finalOutputPath));
  }
  await updateSkillReportPaths(report, outputPathMap);
  const succeeded = results.length;
  const avgTotalSeconds = succeeded
    ? Number((results.reduce((sum, item) => sum + item.totalSeconds, 0) / succeeded).toFixed(3))
    : 0;

  return {
    folderPath,
    outputDir,
    targetLongEdge,
    mode: "realesrgan-native-x4",
    model,
    tileSize,
    total: sourcePaths.length,
    succeeded,
    failed: sourcePaths.length - succeeded,
    avgTotalSeconds,
    integrity: summarizeIntegrity(results),
    report,
    results
  };
}

function buildEmptyBatchPayload({
  folderPath,
  outputDir = folderPath,
  targetLongEdge,
  model = DEFAULT_AI_MODEL,
  tileSize = DEFAULT_TILE_SIZE
}) {
  return {
    folderPath,
    outputDir: "",
    targetLongEdge,
    mode: "realesrgan-native-x4",
    model,
    tileSize,
    total: 0,
    succeeded: 0,
    failed: 0,
    avgTotalSeconds: 0,
    integrity: { pass: 0, review: 0, fail: 0 },
    report: {},
    results: []
  };
}

async function runImageUpscaleBatch({
  folderPath,
  targetLongEdge = 2048,
  batchRunner = defaultImageBatchRunner
}) {
  const folder = await ensureDirectory(folderPath);
  const safeTargetLongEdge = Math.min(Math.max(Number(targetLongEdge) || 2048, 512), 4096);
  const sourcePaths = await listSourceImages(folder);
  return batchRunner({
    folderPath: folder,
    sourcePaths,
    outputDir: folder,
    outputPrefix: OUTPUT_PREFIX,
    targetLongEdge: safeTargetLongEdge,
    model: DEFAULT_AI_MODEL,
    tileSize: DEFAULT_TILE_SIZE,
    finalFormat: "jpeg",
    useNativeX4: true
  });
}

async function fetchLiveRates(base, symbols) {
  const params = new URLSearchParams({
    base,
    symbols: symbols.join(",")
  });
  const endpoint = `https://api.frankfurter.dev/v1/latest?${params.toString()}`;
  const response = await fetch(endpoint, {
    headers: { accept: "application/json" }
  });

  if (!response.ok) {
    throw new Error(`Frankfurter responded with ${response.status}`);
  }

  const payload = await response.json();
  return {
    base: payload.base,
    date: payload.date,
    rates: payload.rates,
    isFallback: false,
    source: "frankfurter.dev"
  };
}

function createServer(options = {}) {
  const app = express();

  app.use(express.json({ limit: "256kb" }));
  app.use(express.static(PUBLIC_DIR));

  app.get("/api/rates", async (request, response) => {
    const base = String(request.query.base || "USD").trim().toUpperCase();
    const symbols = normalizeCurrencyList(request.query.symbols);

    if (!FALLBACK_RATES_BY_USD[base]) {
      response.status(400).json({
        error: "unsupported_base",
        message: `暂不支持以 ${base} 作为基准币种。`
      });
      return;
    }

    try {
      if (options.forceFallbackRates) {
        throw new Error("Forced fallback for tests");
      }

      const liveRates = await fetchLiveRates(base, symbols);
      response.json(liveRates);
    } catch (error) {
      response.json({
        base,
        date: new Date().toISOString().slice(0, 10),
        rates: getFallbackRates(base, symbols),
        isFallback: true,
        source: "local-fallback",
        message: "实时汇率暂不可用，当前使用本地参考汇率，仅适合运营估算。"
      });
    }
  });

  app.post("/api/qrcode", async (request, response) => {
    const text = String(request.body?.text || "").slice(0, 2000);

    if (!text.trim()) {
      response.status(400).json({
        error: "empty_text",
        message: "请输入要生成二维码的文本或链接。"
      });
      return;
    }

    try {
      const dataUrl = await QRCode.toDataURL(text, {
        errorCorrectionLevel: "M",
        margin: 2,
        scale: 8,
        color: {
          dark: "#15231f",
          light: "#f7f3ea"
        }
      });

      response.json({ dataUrl });
    } catch (error) {
      response.status(500).json({
        error: "qrcode_failed",
        message: "二维码生成失败，请缩短内容后重试。"
      });
    }
  });

  app.post("/api/system/pick-folder", async (_request, response) => {
    try {
      const picker = options.folderPicker || defaultFolderPicker;
      const folderPath = await picker();

      if (!folderPath) {
        response.json({
          cancelled: true,
          folderPath: "",
          message: "已取消选择文件夹。"
        });
        return;
      }

      response.json({
        cancelled: false,
        folderPath
      });
    } catch (error) {
      response.status(error.statusCode || 500).json({
        error: "folder_picker_failed",
        message: error.message || "选择文件夹失败，请手动输入路径。"
      });
    }
  });

  app.post("/api/image-upscale/batch", async (request, response) => {
    try {
      const payload = await runImageUpscaleBatch({
        folderPath: request.body?.folderPath,
        targetLongEdge: request.body?.targetLongEdge,
        batchRunner: options.imageBatchRunner || defaultImageBatchRunner
      });
      response.json(payload);
    } catch (error) {
      response.status(error.statusCode || 500).json({
        error: "image_upscale_batch_failed",
        message: error.message || "批量图片处理失败。"
      });
    }
  });

  // Express 5 不再接受 app.get("*") 这种旧式通配路由，这里用无路径中间件兜底返回首页。
  app.use((_request, response) => {
    response.sendFile(path.join(PUBLIC_DIR, "index.html"));
  });

  return app;
}

if (require.main === module) {
  const port = Number(process.env.PORT || DEFAULT_PORT);
  createServer().listen(port, () => {
    console.log(`百宝箱已启动：http://localhost:${port}`);
  });
}

module.exports = {
  createServer,
  defaultFolderPicker,
  getImageUpscalePlan,
  getFallbackRates,
  getUniqueOutputPath,
  listSourceImages,
  normalizeCurrencyList,
  runImageUpscaleBatch,
  updateSkillReportPaths
};
