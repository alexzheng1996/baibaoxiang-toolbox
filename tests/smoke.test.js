/**
 * 文件开头说明：本测试用于验证百宝箱本地服务的最小可用闭环，包括首页可访问和汇率接口可返回结构化数据。
 * 这里使用随机测试端口，实际启动命令仍固定使用 2332，避免测试时与正在运行的服务冲突。
 */

const assert = require("node:assert/strict");
const test = require("node:test");

const { createServer } = require("../app/server");

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
