# 个人头像方向预览 · 2026-11-25

## 选择即保存 · 3.1.11（当前交互）

用户明确希望省掉头像选板的「取消 / 保存」。现为点击造型或颜色立即预览并自动保存，选板保持打开，可继续组合；正常成功静默，失败恢复最近一次服务端确认的头像并提示重试。点击选板外部、再次点击头像或 Escape 仅收起选板，不取消保存；关闭个人设置后请求也继续处理。方向键、Home / End 选择同样自动保存。

实现继续复用 `profile_update_avatar` 与公共 `apiFetch`，接口、权限和 43 个合法 ID 不变。保存串行执行，在途期间的中间选择合并为最后一项；旧响应只更新确认值，不覆盖后续选择、不关闭重开的选板、不抢焦点。显式传入 `apiFetch(..., false)` 保持选项可点。移除原确认按钮、底部空栏与草稿取消逻辑；保存忙碌状态通过头像按钮 `aria-busy` 表达，未增加持续提示文案。配色沿用下文 3.1.10。

验证（PHP 8.3.20，本地临时安装与合成账号）：

- `node .dev/tests/profile_avatar_save_frontend_regression.js`：23 项通过。运行真实头像业务代码与公共 `apiFetch`，覆盖重复选择、快速连续切换、旧响应、切回原值、关闭重开、失败恢复、继续队列及重试。
- `python3 -B .dev/tests/profile_avatar_regression.py --php /Users/yyy/.local/bin/php`：128 项通过，覆盖四类身份、43 个组合、持久化、CSRF、非法 ID 与账号隔离。
- `node .dev/tests/profile_mcp_frontend_regression.js`（37 项）、`node .dev/tests/interaction_no_reload_regression.js`（62 项）、品牌隔离（6 项）、Q9 样式（6 项）、新版本提示（6 组）均通过；`node --check assets/js/app.js`、`php -l includes/modals.php` 与 `git diff --check` 通过。
- Browser plugin not available，使用当前可用的内置浏览器 CUA / Playwright 界面能力。1280×720 下实际检查：有 8 个造型和 6 色，无头像确认底栏；3 秒延迟期间 `walk-coral → rest-coral → rest-indigo` 即时显示最后一项，选项没有禁用；请求记录只有 `walk-coral → rest-indigo`。关闭重开不丢选择，刷新后为 `rest-indigo`。方向键保存标准 Logo 和后续造型、配色均通过；临时副本模拟 `head-amber` 失败，恢复确认值并提示；Escape 仅收起并回焦头像，再次换紫色保存及刷新后为 `head-violet`。error/warn 为空。

证据：[选板截图](avatar-designs/2026-11-25-autosave-avatar-picker.jpg)、[浏览器状态](avatar-designs/2026-11-25-autosave-avatar-browser-state.json)、[实际请求与数据库结果](avatar-designs/2026-11-25-autosave-avatar-request-state.json)。延迟与失败控制只注入临时副本，已清理。版本同步 3.1.11；未重新运行全量套件，未验证移动尺寸、PHP 7.0 或生产部署。未提交、未部署。

## 头像用色收敛 · 3.1.10（当前配色，待视觉验收）

用户反馈 3.1.9 偏粉、偏浅。本轮重新区分三种色彩职责：中等明度且鲜明的主色负责轮廓，同色系较亮的折面负责折纸层次，接近白色的淡底负责衬托；小球继续使用少量异色点缀。珊瑚色的主色由粉红转向橘红。默认晴空蓝与标准 Logo 完整保留。

| 配色 | 主色面 | 浅色面 | 背景 | 小球 |
| --- | --- | --- | --- | --- |
| 碧青 | `#01a883` | `#7ddfbe` | `#e8f8f1` | `#ec983a` |
| 橙金 | `#e68a02` | `#ffc894` | `#fcf1e7` | `#59b6ff` |
| 鸢尾紫 | `#996ae8` | `#c9b2fc` | `#f5f1fe` | `#f78e58` |
| 珊瑚橘 | `#f56249` | `#ffb8aa` | `#fff0ec` | `#08c4d4` |
| 靛蓝 | `#5078f3` | `#a6c0ff` | `#eef3ff` | `#ed973d` |

仍使用头像专用 CSS 变量，SVG 几何、8 个造型、43 个 ID 及编辑图标悬停显隐规则均未变化。通过临时快照逐段比对，确认本轮 CSS 仅变化五组颜色定义，JS 仅变化五个显示名。色彩在 OKLCH 中调整后转换为现有 sRGB Hex，不引入运行依赖。

验证：`node .dev/tests/profile_avatar_save_frontend_regression.js`（13 项）、`node .dev/tests/new_version_badge_regression.js`（6 组）、`python3 -B .dev/tests/brand_isolation_test.py`（6 项）、`python3 -B .dev/tests/q9_styles_regression.py`（6 项）、`node --check assets/js/profile-avatars.js` 及 `git diff --check` 均通过。此次没有接口或权限逻辑变更，未重复运行全量 HTTP 套件。

内置浏览器先检查初版、粉彩版、本次调整及 44px 实际尺寸，再检查真实头像选板；六色的背景、两面与小球的实际计算颜色均符合变量。保存「碧青 · 迈步」并刷新后正确恢复，编辑图标默认透明度仍为 0，error/warn 为空。临时副本与合成账号已清理。版本号同步为 3.1.10，仅本地更新，未提交、未部署。

证据：[三版及 44px 对比](avatar-designs/2026-11-25-balanced-avatar-comparison.jpg)、[实际选板](avatar-designs/2026-11-25-balanced-avatar-picker.jpg)、[浏览器状态](avatar-designs/2026-11-25-balanced-avatar-browser-state.json)、[配色测量与变更边界](avatar-designs/2026-11-25-balanced-avatar-palette-verification.json)。这些是本地实现与观察证据，视觉仍待用户验收。

## 明亮配色与编辑图标显隐 · 3.1.9（配色已替换）

后续用户反馈此版偏粉、偏浅，配色已由 3.1.10 替换；编辑图标显隐规则保留。以下为当时实施记录。

用户要求除默认款之外的头像颜色更轻快，并要求编辑图标默认隐藏、鼠标悬停头像时显示。已按局部优化完成，不改变 8 个造型或 43 个头像 ID。

- 默认蓝色及标准 Logo 的背景、深浅两面和红球均保持原值。其余 5 色提高感知明度、减少灰褐感，标签同步为薄荷青、杏子橙、丁香紫、蜜桃粉、绣球蓝。
- 插画色值继续集中在 `assets/css/app.css` 的头像专用变量中；未改动全站品牌色或状态色。
- 铅笔编辑图标静止时 `opacity:0`，头像悬停及 `:focus-visible` 时为 `1`，移开并失去键盘可见焦点后隐藏。`pointer-events:none` 保持点击入口为头像按钮。
- 色彩按 OKLCH 感知空间生成后映射至 sRGB Hex，生产没有引入新色彩格式、工具或依赖。明亮头像深浅面实算对比为 1.51–1.71，深面与底色为 1.97–2.24；这些是插画层次测量，不宣称文本或控件对比达标。

| 配色 | 深面 | 浅面 | 底色 |
| --- | --- | --- | --- |
| 薄荷青 | `#38c5a0` | `#a8ebd4` | `#ecfbf5` |
| 杏子橙 | `#eca342` | `#fbd3a5` | `#fff5eb` |
| 丁香紫 | `#b995f6` | `#e1d2ff` | `#f8f5ff` |
| 蜜桃粉 | `#f88d92` | `#ffcccc` | `#fff4f4` |
| 绣球蓝 | `#89a6fd` | `#ccdafe` | `#f3f7ff` |

验证：比较调整前后 `POSES`、`ALL_IDS` 与默认色彩变量定义完全相同；头像慢请求前端 13 项、品牌隔离 6 项、Q9 样式 6 项以及版本提示专项通过，`git diff --check` 通过。本轮仅配色/显隐样式、配色显示名与版本基线变化，未重复执行全量 HTTP 测试。

内置浏览器检查了前后配色对比和 44px 显示，读取实际 SVG 的六组计算颜色与预期一致；编辑图标初始透明度 0、键盘聚焦为 1、悬停为 1、移开为 0。选择「丁香紫 · 侧卧」保存并刷新后正确恢复，标准 Logo 仍为 `sky`；error/warn 为空。使用临时安装与合成账号，已清理。

证据：[配色前后对比](avatar-designs/2026-11-25-brighter-avatar-comparison.jpg)、[选板效果](avatar-designs/2026-11-25-brighter-avatar-picker.jpg)、[浏览器状态](avatar-designs/2026-11-25-brighter-avatar-browser-state.json)。仅本地更新，未提交、未部署，视觉仍待用户验收。

## 初次确认与接入 · 3.1.7（历史记录）

用户选定 01（同原 Logo）、02、03、04、07、08、10、12，随后明确可按「8 个形状 + N 个颜色」独立组合。已按此落地：01「标准 Logo」固定品牌蓝与红球，其他 7 款提供晴空蓝、松石青、杏砂金、鸢尾紫、陶珊瑚、深海蓝 6 组配色，共 43 个合法组合。

- `assets/js/profile-avatars.js` 保存完整矢量几何；01 的 17 块多边形与圆球参数精确取自 `assets/images/logo-icon.svg`。其他选中稿提取为多边形轮廓，运行时无需生图 PNG 或任何矢量化工具。
- `assets/css/app.css` 集中定义头像插画专用色彩变量。个人设置展示 4 列 × 2 行造型和独立的 6 色选板；预览、保存、取消、Escape 与方向键延续当前交互。切换造型保留配色；经过标准 Logo 后返回其他造型仍保留上次配色。
- `includes/auth.php` 白名单同步为 43 个组合。版本从 3.1.6 递增为 3.1.7，发版工具兜底、密码脚本资源版本兜底及相关测试基线同步更新。
- 修复实测发现的两项问题：选板底部按钮被个人设置卡片裁切；重绘缩略图移除点击目标后被外部点击守卫误判，导致选项立即取消。
- 既有头像功能、双色图标及其他未提交工作均保留。未提交 Git、未上传 FTP、未修改实际站点数据库。

### 实际验证

1. `python3 -B .dev/tests/profile_avatar_regression.py --php /Users/yyy/.local/bin/php`：128 项通过，覆盖精确 Logo 几何、全部合法组合、主管理员/管理员/协作者/审阅人、访客拦截、CSRF、非法值及跨账号隔离。测试均使用临时安装。
2. `python3 -B .dev/tests/run_all_tests.py --php /Users/yyy/.local/bin/php`：32/32 套通过，可识别断言 1,532 项，128.60 秒。PHP 8.3.20；不等同 PHP 7.0 实测。
3. 浏览器发现的事件守卫与间距修复后，重跑个人设置/MCP 前端 37 项、安全前端 99 项、Q9 样式 6 项，以及 JS/PHP 语法与 `git diff --check`，均通过；没有为这两处局部修复重复执行整套 HTTP 测试。
4. Codex 内置浏览器真实临时站：11 项状态检查通过，包含点击缩略图不误关闭、造型与配色独立、标准 Logo 锁色、返回其他造型保留配色、取消复原、键盘切换、保存、刷新持久化、Escape 复原；浏览器 error/warn 为空。390×844 下造型、配色和底部按钮完整可见，造型列表无滚动溢出。本项不宣称工作台整体移动端通过。
5. 轮廓提取检查 14 个蓝色平面蒙版，简化多边形与去抗锯齿蒙版的 IoU 为 0.9773–0.9909；这是轮廓提取检查，不是用户视觉验收。可选开发工具为 `.dev/tools/vectorize_profile_avatars.py`，依赖本机已有 OpenCV/NumPy，生产不调用该脚本。

最终截图位于 `.dev/screenshots/avatar-study-2026-11-25/avatar-final-picker.jpg`、`avatar-final-picker-mobile.jpg`、`avatar-final-gallery.jpg`；11 项浏览器状态记录为同目录 `avatar-browser-checks.json`。生图依据已复制至本目录下 `avatar-designs/`，避免被全局 `design/` Git 忽略规则排除。旧临时草稿仅作为历史参考。

仍未覆盖：生产部署、真实账号验收、PHP 7.0 实际运行。用户可从本地工作台「个人设置 → 点击头像」验收最终配色。

## 第三轮历史：保留前三个思路，探索不同姿态

用户对上一张生图的前三个构图（01、02、03）给予初步认可，继续要求结合这一思路设计几个不同造型。这不等于已确定最终款式，也未授权跳过「先生图确认，再 SVG 化并补充配色」的顺序。

使用内置 imagegen，以原始 `assets/images/logo-icon.png` 为品牌身份参考、第二轮生图的前三个为造型风格参考，生成 [新姿态对比图 07–12](avatar-designs/2026-11-25-avatar-logo-poses.png)：07 静坐、08 低头、09 回首、10 迈步、11 正面、12 侧卧。新图继续使用品牌蓝、浅蓝、红球，重点比较姿态轮廓，不批量扩展配色。

生成图已观察，当前待用户选型。它是视觉构思，并非精确路径复刻；尚未制作 SVG 或接入运行代码。生图完整提示词见 [姿态生图提示词](avatar-designs/2026-11-25-avatar-logo-poses-prompt.txt)。未修改运行代码、版本号或其他已有未提交工作，本轮无代码测试或生产验收。

## 第二轮：基于 logo 的裁切构图（历史记录）

用户纠正了第一轮方向：必须在现有 logo 的基础上制作，先生图确认，再 SVG 化并补充配色。下文第一轮自绘 A/B 草稿不再推进；其造型和配色均未获批准。

本轮使用内置 imagegen，以 `assets/images/logo-icon.png` 为唯一视觉参考；原始可编辑品牌几何来源为 `assets/images/logo-icon.svg`。先保持品牌蓝、浅蓝、红球，探索全象、半身、象首、象鼻红球、耳部折面和探头六种裁切构图。

生成稿：[六种 logo 衍生头像构图](avatar-designs/2026-11-25-avatar-logo-concepts.png)。生成图是视觉草稿，不等于原 logo 几何完全一致，也不是可直接使用的 SVG。用户确认编号后再以原始 logo 的实际路径重建，并补充配色、验证 44px 可读性。

当前已生成并检查图像输出，待用户选择或修改。尚未转 SVG、补充配色或接入运行代码，未修改版本号、接口、数据库或其他已有未提交工作。本轮无代码验证或生产验收。

### 本轮生图提示词

工具：内置 imagegen。输入：`assets/images/logo-icon.png`。生成策略：一张 3 列 × 2 行构图对比图，非生产资源。

```text
Use case: logo-brand.
Asset type: one image-generation concept contact sheet for default circular account avatars for ProtoLoft (立象原型), a professional prototype collaboration workspace.

Image 1 is the ONLY authoritative visual reference: the actual existing ProtoLoft origami-elephant logo, NOT merely an inspiration. Derive all avatar candidates directly from that exact elephant. Preserve its distinctive sharp irregular polygon construction, the blue large triangular ear, the slanted polygon head, the narrow segmented upturned trunk reaching for the vermilion red ball, its negative-space gaps, and characteristic silhouette. Keep the identity unmistakably the same logo. Do not replace it with a generic origami elephant.

Create a polished flat 3-column by 2-row comparison sheet on a plain very light neutral background. Six equally sized generous circular avatar fields, each with an extremely pale blue background. Each is a distinct framing of THE SAME reference elephant, with the elephant large in the crop. Crisp clean hard-edged two-tone blue vector-like artwork, original saturated primary blue #0076DE and light blue #68B5F8, plus the original small red ball #FF5D47. No color variations yet: this stage is solely for approving silhouette and framing before manual SVG recreation.

Top-left, label "01": whole original elephant and red ball, compact balanced framing, maximum useful size in circle.
Top-middle, label "02": a tight shoulder-and-head portrait from the reference, large triangular ear and characteristic head and raised trunk; lower body intentionally cropped by circle.
Top-right, label "03": a close-up of the original head and upper trunk reaching toward the original red ball; use original angular negative spaces and no invented facial features.
Bottom-left, label "04": striking graphic close-up of the segmented upturned trunk and red ball, with just enough of the head emerging from the lower left for identity; strong original geometric silhouette.
Bottom-middle, label "05": ear-and-head fold detail, boldly enlarged original triangular ear and adjacent original head planes, naturally cropped by circle, preserving recognizability.
Bottom-right, label "06": original elephant seeming to peek into the circular crop from the bottom-left; original shoulder, ear, head and trunk visible, red ball kept within the upper-right of the circle. This is a reframing of the logo, not a new rounded face.

Composition: consistent circle sizes, spacious professional grid, no UI cards or button frames. Small unobtrusive neutral labels 01 through 06 below their respective circles; no other words. Every tile must show clearly readable crisp shapes. Use few meaningful facets and the source's paper-cut gaps; do not invent dense triangular tessellation. Reference should govern the exact anatomy; camera crops may change but not the character.
Constraints: flat filled geometric shapes that can later be faithfully rebuilt as SVG polygons. No gradients, shadows, 3D depth, paper texture, gloss, perspective mockups or realistic lighting. No eyes, pupils, eyebrows, tusks, smiling mouths, rounded ears, curved cartoon trunk, added props, accessories, extra spheres, outlines, or a new elephant logo. No previous avatar designs. This is a raster concept proof for user approval only, not an SVG or final asset.
```

---

## 第一轮历史草稿（已被用户纠正，不再推进）

当前为视觉待选阶段，尚未接入运行代码。用户要求优化当天新增头像的颜色与造型，允许头部、象鼻、耳朵等局部特写。遵循本轮提供的「新视觉方向或重大图片资源先确认再接入」规则，先交付两组可比较的矢量草稿。

- A「折纸肖像」：推荐方向。用大色块折面取代细碎整象，提供侧颜、正脸、局部三种构图。
- B「圆润几何」：同样的三种构图，采用连续曲线，气质更亲和。
- 两组各 18 款，共用雾蓝、苔绿、杏砂、鸢紫、陶粉、夜海六色，便于独立比较造型。
- 颜色属于头像插画专用变量，不替代全站主色或状态色。草稿仍为纯 SVG。

## 文件与复查

- 草稿入口：`.dev/tmp/avatar-study-2026-11-25/index.html`。
- 草稿造型与交互：同目录 `avatars.js`；配色和排版：`study.css`。
- `original-avatars.js` 与 `app.css` 是检查当时运行文件的副本；不是新的运行依赖。
- 对比截图：`.dev/screenshots/avatar-study-2026-11-25/avatar-directions.jpg`。
- 预览命令：`python3 -m http.server 8776 --bind 127.0.0.1 --directory .dev/tmp/avatar-study-2026-11-25`，访问 `http://127.0.0.1:8776/`。

## 已验证与边界

通过 Codex 内置浏览器检查页面身份、36 个选项、侧颜/正脸/局部的图形显示、104px 放大图和 44px 原尺寸示例。点击 A「陶粉 · 局部」及 B「苔绿 · 正脸」后，选中状态与对应预览、标签均同步更新。390px 窄屏页面无横向溢出；浏览器捕获的 error/warn 日志为空。

本次只新增草稿与本记录，未替换 `assets/js/profile-avatars.js`，未修改头像接口、数据库、个人设置交互、版本号或其他已有未提交工作。未执行接口专项或生产验收。用户选定方向后，再做运行代码集成、版本递增及相关回归；不要将该预览写成已上线或已获用户认可。
