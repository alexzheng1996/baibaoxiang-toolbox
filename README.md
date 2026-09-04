# project-004-baibaoxiang-toolbox

> 文件开头说明：本项目是运行在本机 `2332` 端口的百宝箱工具站，用于集中处理日常格式转换、单位换算、二维码、世界时间、汇率、商品图高清放大和跨境运营简算。项目优先追求本地可用、低维护成本和快速打开使用。

## 项目目标

把日常办公和跨境运营中常用的小工具集中到一个本地网页入口，减少临时搜索工具网站、复制内容到第三方页面和重复手算的时间成本。

## 当前状态

- 第一版已完成，可通过 `http://localhost:2332` 使用。
- 已覆盖格式转换、单位换算、二维码、世界时间、汇率换算、商品图高清放大、AI 批量 2K、macOS 选择文件夹、时间工具、文本处理、颜色转换、随机密码、UUID 和跨境运营简算。
- 页面风格已按 `design-taste-frontend` 优化为参考 `3198` 的蓝白工作台：浅蓝侧栏、紧凑顶部状态区、柔和白卡片、蓝色主按钮、清晰输入/操作/结果层级，并支持深色模式和移动端折叠。
- 页面已从大屏满宽卡片改为居中限宽工作台，单位换算、汇率换算和商品图高清放大按日常高频使用优先前置，格式转换下沉到底部，减少打开页面后的查找成本。
- 汇率默认调用公开接口 `https://api.frankfurter.dev/v1/latest`，接口不可用时会使用本地参考汇率继续估算。

## 关键文件

- [app/server.js](/Users/alexwork/Documents/Codex/projects/project-004-baibaoxiang-toolbox/app/server.js)：本地服务、静态页面托管、汇率代理、二维码接口、macOS 选目录接口和 AI 批量 2K 接口。
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
./realesrgan-ncnn-vulkan -i input.jpg -o raw_x4.png -n realesrgan-x4plus -m models -t 2048 -f png
sips -Z 2048 raw_x4.png --out 2K_input.jpg
xattr -c 2K_input.jpg
```

AI 批量 2K 使用方式：

1. 打开 `http://localhost:2332`。
2. 进入“商品图高清放大”。
3. 在“AI 批量 2K 队列”里点击“选择文件夹”，用 macOS 原生窗口选择图片目录；如果窗口不可用，也可以手动输入路径，例如 `/Users/alexwork/Desktop/product-images`。
4. 路径填入后点击“开始批量 2K”。
5. 系统会逐张处理 JPG、PNG、WebP，并把结果保存回原图所在文件夹。

默认处理策略：

- 默认目标“长边 2048”使用升级后的 `local-realesrgan-product-upscale` skill 流程：`realesrgan-x4plus` 原生 4x、`tile=2048`，再用 `sips` 缩回 2048 并输出 JPG。
- 批量结果保存回原图片所在文件夹，不创建子目录；输出统一使用 `2K_原文件名.jpg`，若重名则自动追加序号。
- 不再使用已验证有风险的 `realesrgan-x4plus -s 2` 捷径，避免部分商品图出现不完整、裁切感或拼块错位。
- 系统会返回完整性 `pass/review/fail`、白底保护、耗时、报告和对比图路径；`review/fail` 结果需要人工抽检后再批量使用。

输出命名规则：

```text
A001.jpg  -> 2K_A001.jpg
A002.png  -> 2K_A002.jpg
2K_done.jpg -> 跳过，不重复处理
```

清理与大小规则：

- 2K 输出不会复制原图元数据。
- 输出统一重新编码为 JPG，清理 `OpenAI`、`Media Service`、`prompt`、`workflow`、`C2PA` 等可读来源/提示词信息。
- 系统会检查输出文件是否低于 `1.2MB`；若复杂图片的 JPG 超过该大小，会在结果里提示人工检查，不会为了压小而偷偷明显损害画质。
- 完整 Real-ESRGAN 链路在已测 Apple M4 Max 环境下约 `10-12 秒/张`，批量处理时应预留等待时间。

本次验收记录：

- `npm test` 已通过，3 条冒烟测试全部通过。
- `http://localhost:2332/` 已验证返回 `200 OK`。
- `/api/rates?base=USD&symbols=CNY,EUR,JPY` 已验证能返回实时汇率。
- `/api/qrcode` 已验证能返回 PNG Data URL。
- Playwright 已打开真实页面，并验证 JSON 格式化、二维码生成、日期间隔计算、桌面限宽布局和移动端折叠可用。
- Playwright 已验证商品图高清放大闭环：上传本地样例图后可生成 2x PNG，Canvas 输出 `640 x 480 px`，下载链接为浏览器本地 `blob:` 地址。
- Real-ESRGAN Mac 免 Python 版已下载并解压到 `tools/realesrgan-ncnn-vulkan/`，推荐商品图模型为 `realesrgan-x4plus`；命令行实测可调用 Apple M4 Max 输出 `output/realesrgan-test/input-x2.png`。
- AI 批量 2K 已替换为升级后的 skill 链路：默认生成同目录 `2K_原文件名.jpg`，输出尺寸为 `2048` 长边，已存在的 `2K_` 图片被跳过。
- AI 元数据清理已通过自动测试：输入图片内含 `OpenAI Media Service API`、`prompt`、`workflow` 文本时，输出 `2K_ai-info.jpg` 不再包含这些可读字段。
- macOS 选择文件夹入口已通过自动测试：页面包含“选择文件夹”按钮，`/api/system/pick-folder` 可返回用户选择的真实路径；取消选择时不会启动批量处理。
- 2026-06-25 乱码问题已修复：`0625-19-三门衣柜` 目录中的异常 `2K_` 输出已备份到 `_bad-2k-realesrgan-20260625-170132`，并用安全 2K 链路重新生成正常画面。
- 2026-06-25 Real-ESRGAN 参数复测：`0625-20-车载挂钩/03.png` 使用 `realesrgan-x4plus` 时，`tile=256/512/1024` 会出现明显画面块拼错，`tile=2048` 可避免该样本的切块错位；最终候选图为 `2K_03_realesrgan_tile2048.png`。

## 风险与边界

- 汇率只适合运营估算，不作为财务结算依据。
- 二维码内容通过本机服务生成，不会发到第三方二维码网站。
- 商品图高清放大当前是浏览器本地 Canvas 的保守处理，不等同于 AI 无损恢复；原图过糊、文字太小或压缩很重时，只能改善观感，不能保证还原真实细节。
- AI 批量 2K 会写入用户输入的本地文件夹；使用前要确认路径正确，当前不删除原图、不覆盖已存在结果，重名时会自动追加序号。
- “选择文件夹”按钮只支持本机 macOS 环境；它只负责填入路径，不会自动启动批量处理。非 macOS 或弹窗失败时，可继续手动输入路径。
- Real-ESRGAN 仍可能改写小字、材质或白底细节；当前使用原生 4x 后缩回 2048 和 `tile=2048` 降低切块风险，但 `review/fail` 结果必须人工抽检。
- 复杂图不一定总能在不明显损害画质的前提下压到 `1.2MB` 以下；系统会检查并提示，但不会过度压缩。
- 当前不保存用户输入历史，刷新页面后输入内容会丢失。
- 第一版不支持批量文件上传转换，避免误处理大文件和增加隐私风险。

## 后续事项

- 如需长期固定后台运行，可后续增加本机启动脚本或守护进程配置。
- 如需更贴近亚马逊运营，可继续增加 FBA 费用估算、补货天数、广告预算反推等工具。
- 如需更强的商品图补细节效果，可后续单独接入本地 AI 超分模型，并增加批量队列、耗时提示和失败回退。
- 如需保存常用城市、币种或工具排序，需要先确认本地存储和清理规则。
