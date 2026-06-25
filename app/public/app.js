/*
 * 文件开头说明：本文件负责百宝箱各个工具的浏览器端交互逻辑。
 * 除二维码和汇率需要调用本机服务外，其余工具都在浏览器本地计算，避免把用户输入上传到外部网站。
 */

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

const currencies = ["USD", "CNY", "EUR", "GBP", "JPY", "CAD", "AUD", "HKD", "SGD", "MXN", "AED"];
const fallbackRatesByUsd = {
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

let ratesByBase = {
  base: "USD",
  rates: { ...fallbackRatesByUsd },
  date: "本地参考",
  isFallback: true
};

const unitCategories = {
  length: {
    label: "长度",
    base: "m",
    units: {
      mm: { label: "毫米 mm", factor: 0.001 },
      cm: { label: "厘米 cm", factor: 0.01 },
      m: { label: "米 m", factor: 1 },
      km: { label: "千米 km", factor: 1000 },
      in: { label: "英寸 in", factor: 0.0254 },
      ft: { label: "英尺 ft", factor: 0.3048 },
      yd: { label: "码 yd", factor: 0.9144 },
      mi: { label: "英里 mi", factor: 1609.344 }
    }
  },
  weight: {
    label: "重量",
    base: "kg",
    units: {
      g: { label: "克 g", factor: 0.001 },
      kg: { label: "千克 kg", factor: 1 },
      oz: { label: "盎司 oz", factor: 0.0283495 },
      lb: { label: "磅 lb", factor: 0.45359237 }
    }
  },
  temperature: {
    label: "温度",
    base: "c",
    units: {
      c: { label: "摄氏度 C" },
      f: { label: "华氏度 F" },
      k: { label: "开尔文 K" }
    }
  },
  volume: {
    label: "体积",
    base: "l",
    units: {
      ml: { label: "毫升 ml", factor: 0.001 },
      l: { label: "升 L", factor: 1 },
      floz: { label: "美制液盎司 fl oz", factor: 0.0295735 },
      cup: { label: "美制杯 cup", factor: 0.236588 },
      gal: { label: "美制加仑 gal", factor: 3.78541 }
    }
  },
  area: {
    label: "面积",
    base: "sqm",
    units: {
      sqcm: { label: "平方厘米 cm2", factor: 0.0001 },
      sqm: { label: "平方米 m2", factor: 1 },
      sqft: { label: "平方英尺 ft2", factor: 0.092903 },
      acre: { label: "英亩 acre", factor: 4046.856 }
    }
  },
  speed: {
    label: "速度",
    base: "mps",
    units: {
      mps: { label: "米/秒 m/s", factor: 1 },
      kph: { label: "千米/小时 km/h", factor: 0.277778 },
      mph: { label: "英里/小时 mph", factor: 0.44704 },
      knot: { label: "节 knot", factor: 0.514444 }
    }
  },
  data: {
    label: "数据容量",
    base: "byte",
    units: {
      byte: { label: "Byte", factor: 1 },
      kb: { label: "KB", factor: 1024 },
      mb: { label: "MB", factor: 1024 ** 2 },
      gb: { label: "GB", factor: 1024 ** 3 },
      tb: { label: "TB", factor: 1024 ** 4 }
    }
  }
};

const cityOptions = [
  { label: "洛杉矶", zone: "America/Los_Angeles" },
  { label: "纽约", zone: "America/New_York" },
  { label: "伦敦", zone: "Europe/London" },
  { label: "柏林", zone: "Europe/Berlin" },
  { label: "迪拜", zone: "Asia/Dubai" },
  { label: "上海", zone: "Asia/Shanghai" },
  { label: "东京", zone: "Asia/Tokyo" },
  { label: "新加坡", zone: "Asia/Singapore" },
  { label: "悉尼", zone: "Australia/Sydney" }
];

let selectedCities = ["America/Los_Angeles", "America/New_York", "Europe/London", "Asia/Shanghai"];

function showToast(message) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.add("is-visible");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove("is-visible"), 2200);
}

function setOutput(selector, value) {
  const node = $(selector);
  if (node) {
    node.textContent = value;
  }
}

function parseNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function formatNumber(value, digits = 4) {
  if (!Number.isFinite(value)) {
    return "-";
  }

  return new Intl.NumberFormat("zh-CN", {
    maximumFractionDigits: digits
  }).format(value);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function parseCsv(text) {
  return text
    .trim()
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      const cells = [];
      let current = "";
      let quoted = false;

      for (let index = 0; index < line.length; index += 1) {
        const char = line[index];
        const next = line[index + 1];
        if (char === '"' && quoted && next === '"') {
          current += '"';
          index += 1;
        } else if (char === '"') {
          quoted = !quoted;
        } else if (char === "," && !quoted) {
          cells.push(current);
          current = "";
        } else {
          current += char;
        }
      }
      cells.push(current);
      return cells.map((cell) => cell.trim());
    });
}

function toCsvValue(value) {
  const text = value == null ? "" : String(value);
  if (/[",\n]/.test(text)) {
    return `"${text.replaceAll('"', '""')}"`;
  }
  return text;
}

function markdownToHtml(markdown) {
  const lines = markdown.split(/\r?\n/);
  const html = [];
  let inList = false;

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (!line) {
      if (inList) {
        html.push("</ul>");
        inList = false;
      }
      continue;
    }

    if (line.startsWith("- ")) {
      if (!inList) {
        html.push("<ul>");
        inList = true;
      }
      html.push(`<li>${formatInlineMarkdown(line.slice(2))}</li>`);
      continue;
    }

    if (inList) {
      html.push("</ul>");
      inList = false;
    }

    if (line.startsWith("### ")) {
      html.push(`<h3>${formatInlineMarkdown(line.slice(4))}</h3>`);
    } else if (line.startsWith("## ")) {
      html.push(`<h2>${formatInlineMarkdown(line.slice(3))}</h2>`);
    } else if (line.startsWith("# ")) {
      html.push(`<h1>${formatInlineMarkdown(line.slice(2))}</h1>`);
    } else if (line.startsWith("> ")) {
      html.push(`<blockquote>${formatInlineMarkdown(line.slice(2))}</blockquote>`);
    } else {
      html.push(`<p>${formatInlineMarkdown(line)}</p>`);
    }
  }

  if (inList) {
    html.push("</ul>");
  }

  return html.join("\n");
}

function formatInlineMarkdown(value) {
  return escapeHtml(value)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\[(.+?)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>');
}

function handleJson(action) {
  try {
    const parsed = JSON.parse($("#jsonInput").value);
    setOutput("#jsonOutput", action === "format-json" ? JSON.stringify(parsed, null, 2) : JSON.stringify(parsed));
  } catch (error) {
    setOutput("#jsonOutput", `JSON 解析失败：${error.message}`);
  }
}

function handleCsv(action) {
  try {
    const input = $("#csvInput").value;

    if (action === "csv-to-json") {
      const rows = parseCsv(input);
      const [headers, ...body] = rows;
      if (!headers?.length) {
        throw new Error("CSV 至少需要一行表头。");
      }
      const json = body.map((row) =>
        headers.reduce((record, header, index) => {
          record[header || `field_${index + 1}`] = row[index] ?? "";
          return record;
        }, {})
      );
      setOutput("#csvOutput", JSON.stringify(json, null, 2));
      return;
    }

    const parsed = JSON.parse(input);
    const rows = Array.isArray(parsed) ? parsed : [parsed];
    const headers = Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
    const csv = [headers.join(",")]
      .concat(rows.map((row) => headers.map((header) => toCsvValue(row[header])).join(",")))
      .join("\n");
    setOutput("#csvOutput", csv);
  } catch (error) {
    setOutput("#csvOutput", `转换失败：${error.message}`);
  }
}

function handleCodec(action) {
  const input = $("#codecInput").value;

  try {
    const actions = {
      "base64-encode": () => btoa(unescape(encodeURIComponent(input))),
      "base64-decode": () => decodeURIComponent(escape(atob(input))),
      "url-encode": () => encodeURIComponent(input),
      "url-decode": () => decodeURIComponent(input)
    };
    setOutput("#codecOutput", actions[action]());
  } catch (error) {
    setOutput("#codecOutput", `处理失败：${error.message}`);
  }
}

function setupUnits() {
  const categorySelect = $("#unitCategory");
  categorySelect.innerHTML = Object.entries(unitCategories)
    .map(([key, value]) => `<option value="${key}">${value.label}</option>`)
    .join("");
  categorySelect.value = "length";
  updateUnitOptions();
  calculateUnit();
}

function updateUnitOptions() {
  const category = unitCategories[$("#unitCategory").value];
  const options = Object.entries(category.units)
    .map(([key, unit]) => `<option value="${key}">${unit.label}</option>`)
    .join("");
  $("#unitFrom").innerHTML = options;
  $("#unitTo").innerHTML = options;
  $("#unitFrom").value = Object.keys(category.units)[0];
  $("#unitTo").value = category.base;
}

function convertTemperature(value, from, to) {
  const celsius = from === "c" ? value : from === "f" ? (value - 32) * (5 / 9) : value - 273.15;
  if (to === "c") return celsius;
  if (to === "f") return celsius * (9 / 5) + 32;
  return celsius + 273.15;
}

function calculateUnit() {
  const categoryKey = $("#unitCategory").value;
  const category = unitCategories[categoryKey];
  const value = parseNumber($("#unitValue").value);
  const from = $("#unitFrom").value;
  const to = $("#unitTo").value;

  const result =
    categoryKey === "temperature"
      ? convertTemperature(value, from, to)
      : (value * category.units[from].factor) / category.units[to].factor;

  $("#unitResult").textContent = `${formatNumber(result, 6)} ${category.units[to].label.split(" ").at(-1)}`;
}

async function generateQr() {
  const text = $("#qrInput").value.trim();
  if (!text) {
    $("#qrMessage").textContent = "请输入要生成二维码的文本或链接。";
    return;
  }

  $("#qrMessage").textContent = "正在生成二维码";
  try {
    const response = await fetch("/api/qrcode", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text })
    });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.message || "二维码生成失败。");
    }

    $("#qrImage").src = payload.dataUrl;
    $("#qrDownload").href = payload.dataUrl;
    $("#qrDownload").classList.remove("disabled");
    $(".qr-box").classList.add("has-image");
    $("#qrMessage").textContent = "二维码已生成，可直接下载 PNG。";
  } catch (error) {
    $("#qrMessage").textContent = error.message;
  }
}

function setupWorldClock() {
  $("#citySelect").innerHTML = cityOptions
    .map((city) => `<option value="${city.zone}">${city.label}</option>`)
    .join("");
  renderWorldClock();
}

function renderWorldClock() {
  const now = new Date();
  $("#localClock").textContent = now.toLocaleTimeString("zh-CN", { hour12: false });
  $("#todayLabel").textContent = now.toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long"
  });

  $("#worldClockGrid").innerHTML = selectedCities
    .map((zone) => {
      const city = cityOptions.find((item) => item.zone === zone) || { label: zone, zone };
      const time = now.toLocaleTimeString("zh-CN", {
        timeZone: city.zone,
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false
      });
      const date = now.toLocaleDateString("zh-CN", {
        timeZone: city.zone,
        month: "2-digit",
        day: "2-digit",
        weekday: "short"
      });

      return `<article class="clock-card"><span>${city.label}</span><strong>${time}</strong><span>${date}</span></article>`;
    })
    .join("");
}

function addCity() {
  const zone = $("#citySelect").value;
  if (!selectedCities.includes(zone)) {
    selectedCities = [...selectedCities, zone];
    renderWorldClock();
  }
}

function setupCurrencies() {
  const options = currencies.map((code) => `<option value="${code}">${code}</option>`).join("");
  $("#currencyFrom").innerHTML = options;
  $("#currencyTo").innerHTML = options;
  $("#currencyFrom").value = "USD";
  $("#currencyTo").value = "CNY";
  calculateCurrency();
}

function getRate(from, to) {
  if (from === to) return 1;

  if (ratesByBase.base === from && ratesByBase.rates[to]) {
    return ratesByBase.rates[to];
  }

  const fromByUsd = fallbackRatesByUsd[from];
  const toByUsd = fallbackRatesByUsd[to];
  return toByUsd / fromByUsd;
}

async function refreshRates() {
  const base = $("#currencyFrom").value;
  const symbols = currencies.filter((currency) => currency !== base).join(",");
  $("#rateMeta").textContent = "正在刷新汇率";

  try {
    const response = await fetch(`/api/rates?base=${base}&symbols=${symbols}`);
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.message || "汇率刷新失败。");
    }
    ratesByBase = payload;
    $("#rateMeta").textContent = payload.isFallback
      ? `${payload.date} 本地参考汇率`
      : `${payload.date} 实时汇率，来源 ${payload.source}`;
    calculateCurrency();
  } catch (error) {
    $("#rateMeta").textContent = `刷新失败：${error.message}`;
  }
}

function calculateCurrency() {
  const amount = parseNumber($("#currencyAmount").value);
  const from = $("#currencyFrom").value;
  const to = $("#currencyTo").value;
  const rate = getRate(from, to);
  $("#currencyResult").textContent = `${formatNumber(amount * rate, 4)} ${to}`;
}

function timestampToDate() {
  const raw = $("#timestampInput").value.trim();
  const stamp = Number(raw);
  if (!Number.isFinite(stamp)) {
    setOutput("#timestampOutput", "请输入数字时间戳。");
    return;
  }
  const milliseconds = raw.length <= 10 ? stamp * 1000 : stamp;
  const date = new Date(milliseconds);
  setOutput(
    "#timestampOutput",
    [
      `本地时间：${date.toLocaleString("zh-CN", { hour12: false })}`,
      `ISO 时间：${date.toISOString()}`,
      `秒级时间戳：${Math.floor(milliseconds / 1000)}`,
      `毫秒时间戳：${milliseconds}`
    ].join("\n")
  );
}

function fillNowTimestamp() {
  const now = Date.now();
  $("#timestampInput").value = String(now);
  timestampToDate();
}

function calculateDateDiff() {
  const start = new Date($("#dateStart").value);
  const end = new Date($("#dateEnd").value);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    setOutput("#dateDiffOutput", "请选择开始日期和结束日期。");
    return;
  }
  const diffMs = end - start;
  const days = Math.round(diffMs / 86400000);
  const direction = days >= 0 ? "相差" : "倒序相差";
  setOutput("#dateDiffOutput", `${direction} ${Math.abs(days)} 天\n约 ${formatNumber(Math.abs(days) / 7, 2)} 周`);
}

function handleText(action) {
  const input = $("#textInput").value;
  const lines = input.split(/\r?\n/);
  const handlers = {
    "text-trim": () => lines.map((line) => line.trim()).join("\n"),
    "text-unique": () => Array.from(new Set(lines)).join("\n"),
    "text-remove-empty": () => lines.filter((line) => line.trim()).join("\n"),
    "text-upper": () => input.toUpperCase(),
    "text-lower": () => input.toLowerCase(),
    "text-count": () => {
      const chars = input.length;
      const noSpaces = input.replace(/\s/g, "").length;
      const words = input.trim() ? input.trim().split(/\s+/).length : 0;
      const nonEmptyLines = lines.filter((line) => line.trim()).length;
      return [`字符数：${chars}`, `去空格字符数：${noSpaces}`, `词数：${words}`, `非空行：${nonEmptyLines}`].join("\n");
    },
    "text-prefix-suffix": () => {
      const prefix = $("#prefixInput").value;
      const suffix = $("#suffixInput").value;
      return lines.map((line) => `${prefix}${line}${suffix}`).join("\n");
    }
  };
  setOutput("#textOutput", handlers[action]());
}

function convertColor() {
  const raw = $("#colorInput").value.trim();
  const hex = normalizeHex(raw);
  if (!hex) {
    setOutput("#colorOutput", "请输入合法 HEX 色值，例如 #2f6f5e。");
    return;
  }
  const rgb = hexToRgb(hex);
  const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
  $("#colorPicker").value = hex;
  setOutput(
    "#colorOutput",
    [`HEX：${hex}`, `RGB：rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`, `HSL：hsl(${hsl.h}, ${hsl.s}%, ${hsl.l}%)`].join("\n")
  );
}

function normalizeHex(value) {
  const trimmed = value.startsWith("#") ? value.slice(1) : value;
  if (/^[0-9a-fA-F]{3}$/.test(trimmed)) {
    return `#${trimmed
      .split("")
      .map((char) => char + char)
      .join("")
      .toLowerCase()}`;
  }
  if (/^[0-9a-fA-F]{6}$/.test(trimmed)) {
    return `#${trimmed.toLowerCase()}`;
  }
  return null;
}

function hexToRgb(hex) {
  const value = hex.slice(1);
  return {
    r: parseInt(value.slice(0, 2), 16),
    g: parseInt(value.slice(2, 4), 16),
    b: parseInt(value.slice(4, 6), 16)
  };
}

function rgbToHsl(r, g, b) {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const delta = max - min;
    s = l > 0.5 ? delta / (2 - max - min) : delta / (max + min);
    if (max === r) h = (g - b) / delta + (g < b ? 6 : 0);
    if (max === g) h = (b - r) / delta + 2;
    if (max === b) h = (r - g) / delta + 4;
    h /= 6;
  }

  return {
    h: Math.round(h * 360),
    s: Math.round(s * 100),
    l: Math.round(l * 100)
  };
}

function generatePasswords() {
  const length = Math.min(Math.max(parseNumber($("#passwordLength").value, 16), 8), 64);
  const count = Math.min(Math.max(parseNumber($("#passwordCount").value, 3), 1), 20);
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%&*";
  const values = Array.from({ length: count }, () => {
    const bytes = new Uint32Array(length);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
  });
  setOutput("#randomOutput", values.join("\n"));
}

function generateUuid() {
  setOutput("#randomOutput", crypto.randomUUID());
}

function calculateAmazon() {
  const salePrice = parseNumber($("#salePrice").value);
  const productCost = parseNumber($("#productCost").value);
  const shippingCost = parseNumber($("#shippingCost").value);
  const platformFee = parseNumber($("#platformFee").value);
  const adSpend = parseNumber($("#adSpend").value);
  const adSales = parseNumber($("#adSales").value);
  const totalSales = parseNumber($("#totalSales").value);

  const grossProfitBeforeAds = salePrice - productCost - shippingCost - platformFee;
  const profitAfterAds = grossProfitBeforeAds - adSpend;
  const grossMargin = salePrice ? (grossProfitBeforeAds / salePrice) * 100 : 0;
  const netMargin = salePrice ? (profitAfterAds / salePrice) * 100 : 0;
  const acos = adSales ? (adSpend / adSales) * 100 : 0;
  const tacos = totalSales ? (adSpend / totalSales) * 100 : 0;

  const metrics = [
    ["广告前毛利", grossProfitBeforeAds.toFixed(2)],
    ["广告后利润", profitAfterAds.toFixed(2)],
    ["广告前毛利率", `${formatNumber(grossMargin, 2)}%`],
    ["广告后利润率", `${formatNumber(netMargin, 2)}%`],
    ["ACOS", `${formatNumber(acos, 2)}%`],
    ["TACOS", `${formatNumber(tacos, 2)}%`]
  ];

  $("#amazonResult").innerHTML = metrics
    .map(([label, value]) => `<article class="metric-card"><span>${label}</span><strong>${value}</strong></article>`)
    .join("");
}

function setupCopyButtons() {
  $$("[data-copy]").forEach((button) => {
    button.addEventListener("click", async () => {
      const target = $(button.dataset.copy);
      const text = target?.textContent || "";
      if (!text.trim()) {
        showToast("没有可复制的内容");
        return;
      }
      await navigator.clipboard.writeText(text);
      showToast("已复制");
    });
  });
}

function bindActions() {
  document.addEventListener("click", (event) => {
    const button = event.target.closest("[data-action]");
    if (!button) return;

    const action = button.dataset.action;
    if (["format-json", "minify-json"].includes(action)) handleJson(action);
    if (["csv-to-json", "json-to-csv"].includes(action)) handleCsv(action);
    if (["base64-encode", "base64-decode", "url-encode", "url-decode"].includes(action)) handleCodec(action);
    if (action === "markdown-preview") {
      const html = markdownToHtml($("#markdownInput").value);
      setOutput("#markdownOutput", html);
      $("#markdownPreview").innerHTML = html || "预览会显示在这里";
    }
    if (action === "generate-qr") generateQr();
    if (action === "add-city") addCity();
    if (action === "refresh-rates") refreshRates();
    if (action === "timestamp-to-date") timestampToDate();
    if (action === "now-timestamp") fillNowTimestamp();
    if (action === "date-diff") calculateDateDiff();
    if (action.startsWith("text-")) handleText(action);
    if (action === "color-convert") convertColor();
    if (action === "generate-passwords") generatePasswords();
    if (action === "generate-uuid") generateUuid();
    if (action === "amazon-calc") calculateAmazon();
  });

  ["#unitCategory", "#unitValue", "#unitFrom", "#unitTo"].forEach((selector) => {
    $(selector).addEventListener("input", () => {
      if (selector === "#unitCategory") updateUnitOptions();
      calculateUnit();
    });
  });

  ["#currencyAmount", "#currencyFrom", "#currencyTo"].forEach((selector) => {
    $(selector).addEventListener("input", () => {
      if (selector === "#currencyFrom") refreshRates();
      calculateCurrency();
    });
  });

  $("#colorPicker").addEventListener("input", (event) => {
    $("#colorInput").value = event.target.value;
    convertColor();
  });
}

function markActiveNavigation() {
  const sections = $$(".tool-section");
  const links = $$(".tool-nav a");
  const observer = new IntersectionObserver(
    (entries) => {
      const visible = entries
        .filter((entry) => entry.isIntersecting)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (!visible) return;

      links.forEach((link) => {
        link.classList.toggle("is-active", link.getAttribute("href") === `#${visible.target.id}`);
      });
    },
    { rootMargin: "-20% 0px -70% 0px", threshold: [0.1, 0.25, 0.5] }
  );
  sections.forEach((section) => observer.observe(section));
}

function setDefaultDates() {
  const today = new Date();
  const nextWeek = new Date(today);
  nextWeek.setDate(today.getDate() + 7);
  $("#dateStart").valueAsDate = today;
  $("#dateEnd").valueAsDate = nextWeek;
}

function init() {
  setupUnits();
  setupCurrencies();
  setupWorldClock();
  setupCopyButtons();
  bindActions();
  markActiveNavigation();
  setDefaultDates();
  convertColor();
  calculateAmazon();
  refreshRates();
  setInterval(renderWorldClock, 1000);
}

init();
