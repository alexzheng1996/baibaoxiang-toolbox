/**
 * 文件开头说明：本文件负责启动百宝箱本地服务、托管静态页面，并代理公开汇率接口。
 * 汇率接口只用于日常运营估算；当外部接口不可用时，服务会返回内置兜底汇率，保证工具站不断档。
 */

const path = require("node:path");
const express = require("express");
const QRCode = require("qrcode");

const DEFAULT_PORT = 2332;
const PUBLIC_DIR = path.join(__dirname, "public");

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
  getFallbackRates,
  normalizeCurrencyList
};
