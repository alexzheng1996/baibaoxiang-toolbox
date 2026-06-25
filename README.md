# project-004-baibaoxiang-toolbox

> 文件开头说明：本项目是运行在本机 `2332` 端口的百宝箱工具站，用于集中处理日常格式转换、单位换算、二维码、世界时间、汇率、商品图高清放大和跨境运营简算。项目优先追求本地可用、低维护成本和快速打开使用。

## 项目目标

把日常办公和跨境运营中常用的小工具集中到一个本地网页入口，减少临时搜索工具网站、复制内容到第三方页面和重复手算的时间成本。

## 当前状态

- 第一版已完成，可通过 `http://localhost:2332` 使用。
- 已覆盖格式转换、单位换算、二维码、世界时间、汇率换算、商品图高清放大、时间工具、文本处理、颜色转换、随机密码、UUID 和跨境运营简算。
- 页面风格已按 `design-taste-frontend` 优化为参考 `3198` 的蓝白工作台：浅蓝侧栏、紧凑顶部状态区、柔和白卡片、蓝色主按钮、清晰输入/操作/结果层级，并支持深色模式和移动端折叠。
- 页面已从大屏满宽卡片改为居中限宽工作台，单位与汇率、二维码与世界时间、时间工具与开发工具按使用场景成组显示，减少横向拉伸和空白感。
- 汇率默认调用公开接口 `https://api.frankfurter.dev/v1/latest`，接口不可用时会使用本地参考汇率继续估算。

## 关键文件

- [app/server.js](/Users/alexwork/Documents/Codex/projects/project-004-baibaoxiang-toolbox/app/server.js)：本地服务、静态页面托管、汇率代理、二维码接口。
- [app/public/index.html](/Users/alexwork/Documents/Codex/projects/project-004-baibaoxiang-toolbox/app/public/index.html)：页面结构和工具入口。
- [app/public/styles.css](/Users/alexwork/Documents/Codex/projects/project-004-baibaoxiang-toolbox/app/public/styles.css)：参考 `3198` 的蓝白工作台视觉样式和响应式布局。
- [app/public/app.js](/Users/alexwork/Documents/Codex/projects/project-004-baibaoxiang-toolbox/app/public/app.js)：浏览器端通用工具逻辑。
- [app/public/image-upscale.js](/Users/alexwork/Documents/Codex/projects/project-004-baibaoxiang-toolbox/app/public/image-upscale.js)：商品图高清放大的本地上传、分步放大、白底保护、保守增强和 PNG 下载逻辑。
- [tools/realesrgan-ncnn-vulkan/](/Users/alexwork/Documents/Codex/projects/project-004-baibaoxiang-toolbox/tools/realesrgan-ncnn-vulkan/)：本地 Real-ESRGAN 免 Python 超分工具目录，已被 `.gitignore` 忽略，不纳入版本管理。
- [tests/smoke.test.js](/Users/alexwork/Documents/Codex/projects/project-004-baibaoxiang-toolbox/tests/smoke.test.js)：首页、汇率接口和图片放大脚本冒烟测试。
- [../../docs/superpowers/specs/2026-06-24-baibaoxiang-toolbox-design.md](/Users/alexwork/Documents/Codex/docs/superpowers/specs/2026-06-24-baibaoxiang-toolbox-design.md)：产品范围与设计说明。

## 执行与验收方式

首次安装依赖：

```bash
cd /Users/alexwork/Documents/Codex/projects/project-004-baibaoxiang-toolbox/app
npm install
```

启动工具站：

```bash
cd /Users/alexwork/Documents/Codex/projects/project-004-baibaoxiang-toolbox/app
npm start
```

打开：

```text
http://localhost:2332
```

自动测试：

```bash
cd /Users/alexwork/Documents/Codex/projects/project-004-baibaoxiang-toolbox/app
npm test
```

AI 超分命令行验证：

```bash
cd /Users/alexwork/Documents/Codex/projects/project-004-baibaoxiang-toolbox/tools/realesrgan-ncnn-vulkan
./realesrgan-ncnn-vulkan -i input.jpg -o /Users/alexwork/Documents/Codex/projects/project-004-baibaoxiang-toolbox/output/realesrgan-test/input-x2.png -s 2 -n realesrgan-x4plus -m models -f png -v
```

本次验收记录：

- `npm test` 已通过，3 条冒烟测试全部通过。
- `http://localhost:2332/` 已验证返回 `200 OK`。
- `/api/rates?base=USD&symbols=CNY,EUR,JPY` 已验证能返回实时汇率。
- `/api/qrcode` 已验证能返回 PNG Data URL。
- Playwright 已打开真实页面，并验证 JSON 格式化、二维码生成、日期间隔计算、桌面限宽布局和移动端折叠可用。
- Playwright 已验证商品图高清放大闭环：上传本地样例图后可生成 2x PNG，Canvas 输出 `640 x 480 px`，下载链接为浏览器本地 `blob:` 地址。
- Real-ESRGAN Mac 免 Python 版已下载并解压到 `tools/realesrgan-ncnn-vulkan/`，推荐商品图模型为 `realesrgan-x4plus`；命令行实测可调用 Apple M4 Max 输出 `output/realesrgan-test/input-x2.png`。

## 风险与边界

- 汇率只适合运营估算，不作为财务结算依据。
- 二维码内容通过本机服务生成，不会发到第三方二维码网站。
- 商品图高清放大当前是浏览器本地 Canvas 的保守处理，不等同于 AI 无损恢复；原图过糊、文字太小或压缩很重时，只能改善观感，不能保证还原真实细节。
- Real-ESRGAN 已完成本地命令行验证，但尚未接入网页按钮；后续接入时需要增加文件队列、耗时提示、失败回退和假细节风险提示。
- 当前不保存用户输入历史，刷新页面后输入内容会丢失。
- 第一版不支持批量文件上传转换，避免误处理大文件和增加隐私风险。

## 后续事项

- 如需长期固定后台运行，可后续增加本机启动脚本或守护进程配置。
- 如需更贴近亚马逊运营，可继续增加 FBA 费用估算、补货天数、广告预算反推等工具。
- 如需更强的商品图补细节效果，可后续单独接入本地 AI 超分模型，并增加批量队列、耗时提示和失败回退。
- 如需保存常用城市、币种或工具排序，需要先确认本地存储和清理规则。
