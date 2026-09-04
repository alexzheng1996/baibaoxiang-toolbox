/**
 * 文件开头说明：本测试用于验证百宝箱本地服务的最小可用闭环，包括首页可访问、核心工具排序、汇率接口和商品图 AI 批量 2K skill 链路。
 * 这里使用随机测试端口，实际启动命令仍固定使用 2332，避免测试时与正在运行的服务冲突。
 */

const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { createServer } = require("../app/server");
const { getImageUpscalePlan } = require("../app/server");
const { updateSkillReportPaths } = require("../app/server");

function listen(server) {
  return new Promise((resolve, reject) => {
    const listener = server.listen(0, "127.0.0.1");
    listener.once("error", reject);
    listener.once("listening", () => {
      const address = listener.address();
      resolve({
        origin: `http://127.0.0.1:${address.port}`,
        listener
      });
    });
  });
}

function close(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

test("首页返回百宝箱工具站页面", async () => {
  const server = createServer({ forceFallbackRates: true });
  const { origin, listener } = await listen(server);

  try {
    const response = await fetch(`${origin}/`);
    const html = await response.text();

    assert.equal(response.status, 200);
    assert.match(html, /百宝箱/);
    assert.match(html, /世界时间/);
    assert.match(html, /二维码/);
    assert.match(html, /商品图高清放大/);
    assert.match(html, /#image-upscale/);
    assert.match(html, /\/image-upscale\.js/);
    assert.match(html, /batchPickFolder/);
    assert.match(html, /选择文件夹/);
  } finally {
    await close(listener);
  }
});

test("首页优先展示单位、汇率和图片工具，格式转换下沉到底部", async () => {
  const server = createServer({ forceFallbackRates: true });
  const { origin, listener } = await listen(server);

  try {
    const response = await fetch(`${origin}/`);
    const html = await response.text();
    const sectionOrder = [...html.matchAll(/<section id="([^"]+)" class="tool-section">/g)].map(
      (match) => match[1]
    );

    assert.deepEqual(sectionOrder.slice(0, 3), ["units", "currency", "image-upscale"]);
    assert.equal(sectionOrder.at(-1), "format");
  } finally {
    await close(listener);
  }
});

test("本机选文件夹接口返回用户选择的真实路径", async () => {
  const selectedFolder = path.join(os.tmpdir(), "product-images");
  const server = createServer({
    forceFallbackRates: true,
    folderPicker: async () => selectedFolder
  });
  const { origin, listener } = await listen(server);

  try {
    const response = await fetch(`${origin}/api/system/pick-folder`, {
      method: "POST"
    });
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.cancelled, false);
    assert.equal(payload.folderPath, selectedFolder);
  } finally {
    await close(listener);
  }
});

test("汇率接口在兜底模式下返回可计算数据", async () => {
  const server = createServer({ forceFallbackRates: true });
  const { origin, listener } = await listen(server);

  try {
    const response = await fetch(`${origin}/api/rates?base=USD&symbols=CNY,EUR`);
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.base, "USD");
    assert.equal(payload.isFallback, true);
    assert.equal(typeof payload.rates.CNY, "number");
    assert.equal(typeof payload.rates.EUR, "number");
  } finally {
    await close(listener);
  }
});

test("商品图高清放大脚本由本地服务托管", async () => {
  const server = createServer({ forceFallbackRates: true });
  const { origin, listener } = await listen(server);

  try {
    const response = await fetch(`${origin}/image-upscale.js`);
    const script = await response.text();

    assert.equal(response.status, 200);
    assert.match(script, /processUpscale/);
    assert.match(script, /drawUpscaledImage/);
    assert.match(script, /downloadUpscaledImage/);
  } finally {
    await close(listener);
  }
});

test("默认 2048 目标使用 skill 的 Real-ESRGAN 原生 4x 后缩回流程", () => {
  const plan = getImageUpscalePlan({ width: 1254, height: 1254 }, 2048);

  assert.equal(plan.mode, "realesrgan-native-x4");
  assert.equal(plan.reason, "skill-native-x4-then-resize");
  assert.equal(plan.model, "realesrgan-x4plus");
  assert.equal(plan.tileSize, 2048);
  assert.equal(plan.usesScaleShortcut, false);
});

test("批量 2K 接口调用 skill 批量链路并返回报告", async () => {
  const folder = await fs.mkdtemp(path.join(os.tmpdir(), "baibaoxiang-upscale-"));
  const sourcePath = path.join(folder, "main-image.jpg");
  await fs.writeFile(sourcePath, "fake image");
  const calls = [];

  const server = createServer({
    forceFallbackRates: true,
    imageBatchRunner: async (options) => {
      calls.push(options);
      const outputDir = folder;
      const outputPath = path.join(outputDir, "2K_main-image.jpg");
      await fs.writeFile(outputPath, "clean jpg bytes");
      return {
        folderPath: folder,
        outputDir,
        targetLongEdge: 2048,
        mode: "realesrgan-native-x4",
        model: "realesrgan-x4plus",
        tileSize: 2048,
        total: 1,
        succeeded: 1,
        failed: 0,
        avgTotalSeconds: 10.03,
        integrity: { pass: 1, review: 0, fail: 0 },
        report: {
          csvPath: path.join(outputDir, "benchmark_realesrgan_x4_tile2048.csv"),
          jsonPath: path.join(outputDir, "benchmark_realesrgan_x4_tile2048.json"),
          comparisonPath: path.join(outputDir, "comparison_realesrgan_x4_tile2048.jpg")
        },
        results: [
          {
            sourcePath,
            outputPath,
            status: "done",
            outputSize: { width: 2048, height: 1536 },
            fileSizeBytes: 15,
            underSizeLimit: true,
            metadataCleaned: true,
            sensitiveMarkers: [],
            whiteBgEnabled: true,
            whiteBgRestoredPixels: 12,
            integrityStatus: "pass",
            aiSeconds: 8.5,
            postSeconds: 1.5,
            totalSeconds: 10.03,
            message: "已按 Real-ESRGAN 原生 4x + tile 2048 + 缩回 2048 生成。"
          }
        ]
      };
    }
  });
  const { origin, listener } = await listen(server);

  try {
    const response = await fetch(`${origin}/api/image-upscale/batch`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ folderPath: folder, targetLongEdge: 2048 })
    });
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].folderPath, folder);
    assert.equal(calls[0].outputDir, folder);
    assert.equal(calls[0].outputPrefix, "2K_");
    assert.equal(calls[0].targetLongEdge, 2048);
    assert.equal(calls[0].tileSize, 2048);
    assert.equal(calls[0].model, "realesrgan-x4plus");
    assert.equal(calls[0].finalFormat, "jpeg");
    assert.equal(calls[0].useNativeX4, true);
    assert.equal(payload.total, 1);
    assert.equal(payload.succeeded, 1);
    assert.equal(payload.failed, 0);
    assert.equal(payload.mode, "realesrgan-native-x4");
    assert.equal(payload.model, "realesrgan-x4plus");
    assert.equal(payload.tileSize, 2048);
    assert.equal(payload.avgTotalSeconds, 10.03);
    assert.deepEqual(payload.integrity, { pass: 1, review: 0, fail: 0 });
    assert.match(payload.report.comparisonPath, /comparison_realesrgan_x4_tile2048\.jpg$/);
    assert.equal(payload.results[0].status, "done");
    assert.equal(payload.outputDir, folder);
    assert.equal(payload.results[0].outputPath, path.join(folder, "2K_main-image.jpg"));
    assert.equal(payload.results[0].integrityStatus, "pass");
    assert.equal(payload.results[0].whiteBgEnabled, true);
    assert.equal(typeof payload.results[0].fileSizeBytes, "number");
    assert.equal(payload.results[0].underSizeLimit, true);
    assert.match(payload.results[0].message, /Real-ESRGAN/);
    assert.equal(await fileExists(path.join(folder, "2K_main-image.jpg")), true);
  } finally {
    await close(listener);
    await fs.rm(folder, { recursive: true, force: true });
  }
});

test("批量 2K 输出会清理 AI 来源和 prompt 等可读元数据", async () => {
  const folder = await fs.mkdtemp(path.join(os.tmpdir(), "baibaoxiang-upscale-"));
  const sourcePath = path.join(folder, "ai-source.png");
  await fs.writeFile(sourcePath, "OpenAI Media Service API prompt workflow");

  const server = createServer({
    forceFallbackRates: true,
    imageBatchRunner: async () => {
      const outputPath = path.join(folder, "2K_ai-source.jpg");
      await fs.writeFile(outputPath, "OpenAI Media Service API prompt workflow clean pixels");
      await fs.writeFile(outputPath, "clean pixels only");
      return {
        folderPath: folder,
        outputDir: folder,
        targetLongEdge: 2048,
        mode: "realesrgan-native-x4",
        model: "realesrgan-x4plus",
        tileSize: 2048,
        total: 1,
        succeeded: 1,
        failed: 0,
        avgTotalSeconds: 10,
        integrity: { pass: 1, review: 0, fail: 0 },
        report: {},
        results: [
          {
            sourcePath,
            outputPath,
            status: "done",
            outputSize: { width: 2048, height: 2048 },
            fileSizeBytes: 17,
            underSizeLimit: true,
            metadataCleaned: true,
            sensitiveMarkers: [],
            integrityStatus: "pass",
            message: "已按 Real-ESRGAN 原生 4x + tile 2048 + 缩回 2048 生成。"
          }
        ]
      };
    }
  });
  const { origin, listener } = await listen(server);

  try {
    const response = await fetch(`${origin}/api/image-upscale/batch`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ folderPath: folder })
    });
    const payload = await response.json();
    const output = await fs.readFile(path.join(folder, "2K_ai-source.jpg"), "utf8");

    assert.equal(response.status, 200);
    assert.equal(payload.results[0].status, "done");
    assert.equal(payload.results[0].metadataCleaned, true);
    assert.doesNotMatch(output, /OpenAI|Media Service|prompt|workflow|C2PA/i);
    assert.match(output, /clean pixels only/);
  } finally {
    await close(listener);
    await fs.rm(folder, { recursive: true, force: true });
  }
});

test("批量 2K 接口跳过已带 2K_ 前缀的图片", async () => {
  const folder = await fs.mkdtemp(path.join(os.tmpdir(), "baibaoxiang-upscale-"));
  await fs.writeFile(path.join(folder, "2K_done.jpg"), "already processed");
  await fs.writeFile(path.join(folder, "raw.webp"), "fake image");
  const processedSources = [];

  const server = createServer({
    forceFallbackRates: true,
    imageBatchRunner: async ({ sourcePaths }) => {
      processedSources.push(...sourcePaths);
      return {
        folderPath: folder,
        outputDir: folder,
        targetLongEdge: 2048,
        mode: "realesrgan-native-x4",
        model: "realesrgan-x4plus",
        tileSize: 2048,
        total: sourcePaths.length,
        succeeded: sourcePaths.length,
        failed: 0,
        avgTotalSeconds: 10,
        integrity: { pass: sourcePaths.length, review: 0, fail: 0 },
        report: {},
        results: sourcePaths.map((item) => ({
          sourcePath: item,
          outputPath: path.join(folder, `2K_${path.parse(item).name}.jpg`),
          status: "done",
          outputSize: { width: 2048, height: 2048 },
          fileSizeBytes: 10,
          underSizeLimit: true,
          metadataCleaned: true,
          sensitiveMarkers: [],
          integrityStatus: "pass",
          message: "已按 Real-ESRGAN 原生 4x + tile 2048 + 缩回 2048 生成。"
        }))
      };
    }
  });
  const { origin, listener } = await listen(server);

  try {
    const response = await fetch(`${origin}/api/image-upscale/batch`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ folderPath: folder })
    });
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.total, 1);
    assert.deepEqual(
      processedSources.map((item) => path.basename(item)),
      ["raw.webp"]
    );
    assert.equal(payload.results[0].outputPath, path.join(folder, "2K_raw.jpg"));
  } finally {
    await close(listener);
    await fs.rm(folder, { recursive: true, force: true });
  }
});

test("skill 报告里的输出路径会同步为最终 2K_ 文件名", async () => {
  const folder = await fs.mkdtemp(path.join(os.tmpdir(), "baibaoxiang-report-"));
  const oldOutput = path.join(folder, "main-image_2k_realesrgan_x4_tile2048.jpg");
  const finalOutput = path.join(folder, "2K_main-image.jpg");
  const report = {
    jsonPath: path.join(folder, "benchmark_realesrgan_x4_tile2048.json"),
    csvPath: path.join(folder, "benchmark_realesrgan_x4_tile2048.csv")
  };

  await fs.writeFile(report.jsonPath, JSON.stringify([{ file: "main-image.jpg", output: oldOutput }]), "utf8");
  await fs.writeFile(report.csvPath, `file,output\nmain-image.jpg,${oldOutput}\n`, "utf8");

  try {
    await updateSkillReportPaths(report, new Map([[oldOutput, finalOutput]]));
    const jsonRows = JSON.parse(await fs.readFile(report.jsonPath, "utf8"));
    const csvText = await fs.readFile(report.csvPath, "utf8");

    assert.equal(jsonRows[0].output, finalOutput);
    assert.match(csvText, new RegExp(escapeRegExp(finalOutput)));
    assert.doesNotMatch(csvText, new RegExp(escapeRegExp(oldOutput)));
  } finally {
    await fs.rm(folder, { recursive: true, force: true });
  }
});

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
