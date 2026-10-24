# Mirages 7.10.6 逐页视觉对照

日期：2026-10-25。基线由用户指定：本机 Mirages 7.10.6，作者示例站 <https://get233.com/> 仅辅助对照（检查时为 7.11.0）。

本轮完成公开内容页面的逐页视觉检查及发现的问题修复。可以打开[对照画廊](visual/mirages-7.10.6/index.html)，选择页面、桌面/手机、明暗模式，并显示修复前首屏。**完成的是列明范围的对照验收，不代表与原主题逐像素一致或完整兼容 Typecho。**

## 基线与方法

- 原版包：`Mirages-7.10.6.zip`；使用其中的 `css/7.10.6/mirages.min.css`、字体，以及 `header.php`、`navbar.php`、`headfix_pages.php`、`index.php`、`archive.php`、`post.php`、`page.php`、`archives.php` 和 `404.php` 对应结构。
- 原版 CSS SHA-256：`588ed5b86721a5433dbed56ef02f90bb1cdc67ee1e68e11be61f63a752cac9dc`。
- 本机没有 PHP，主参考是**使用原版 CSS、字体及模板 HTML 结构的静态样板**，不是运行中的 Typecho 实例。动态 PHP 分支、评论插件、播放器插件和主题 JavaScript 的完整行为不在这一参考的证明范围内。
- 两边使用相同合成标题、正文和封面。横幅高度统一为桌面 445px、手机 338px，便于比较；这只是本次配置，不代表原主题的所有配置。文章时间、浏览数、卡片元信息仍由各自实现生成，不作像素匹配。
- Rin 使用隔离的本地 D1 和完整 Worker。测试内容、评论、页面字段均为合成数据；没有操作远程数据库或部署。
- 使用 ego-browser 的 Chromium 渲染。原生截图接口不可用，因此在 `screen` 媒体模式下通过 `Page.printToPDF` 导出整页，再用 macOS PDFKit 转图、压缩为 WebP。**这不是原生截图，也没有计算像素差分通过率**；PDF 导出可能影响分页、固定元素及字体栅格化。另用实时 DOM 尺寸和交互检查补充验证；按钮阴影等 PDF 合成效果不作为像素一致性的依据。
- 导出时关闭过渡动画并等待字体加载。部分图片仍带有浏览器翻译扩展的蓝色浮层（左上角）；页面样式未能完全隐藏它，该浮层不是网站内容。

## 逐页结果

每条 Rin 路由检查 1280 × 900、390 × 844，以及浅色、深色四种组合。九种页面模板全部包含在内。

| 页面 | Rin 路由 | 参考来源 / 检查结果 |
| --- | --- | --- |
| 首页 | `/` | 原版 index；校正横幅、导航、列表宽度和手机边距 |
| 分类 | `/category/tech` | 原版 archive；分类标题、描述、列表版心正常 |
| 文章 | `/feed/1` | 原版 post；检查标题、正文、引用、列表、代码、表格；目录和评论保留 Rin 实现 |
| 独立页面 default | `/page/about` | 原版 page；移除重复标题、校正版心和首段间距 |
| 文章归档 | `/timeline` | 原版 archives；两边的归档列表结构不同，保留 Rin 时间线呈现 |
| 标签列表 | `/hashtags` | 比较原版 archives 中的标签云区块；原版没有这个独立路由 |
| 标签文章 | `/hashtag/迁移` | 原版 archive；标签标题、卡片和手机布局正常 |
| 搜索 | `/search/迁移` | 原版 archive；补全关键字横幅标题，改用列表布局 |
| 错误页 | `/rin-visual-check-missing` | 原版 404；Rin 保留通用错误提示和返回按钮，详见差异说明 |
| links | `/page/demo-links` | Rin 扩展；链接卡片、正文、明暗边框正常 |
| music | `/page/demo-music` | Rin 扩展；播放器及正文布局正常，不验证外部音频可用性 |
| wide | `/page/demo-wide` | Rin 扩展；保留更宽正文，检查手机内边距 |
| portfolio | `/page/demo-portfolio` | Rin 扩展；消除相邻文章样式误伤，项目网格正常 |
| gallery | `/page/demo-gallery` | Rin 扩展；图片、说明及手机排列正常 |
| timeline 模板 | `/page/demo-timeline` | Rin 扩展；事件轴与正文正常 |
| resume | `/page/demo-resume` | Rin 扩展；侧栏、技能和经历排版正常 |
| docs | `/page/demo-docs` | Rin 扩展；目录和正文组合正常 |
| 友链 | `/friends` | Rin 功能；增加空态，头像缺失或加载失败时有文字回退 |
| 动态 | `/moments` | Rin 功能；增加空态，隐藏重复标题时保留发布入口 |

主矩阵共 76 组 Rin 整页渲染、36 组原版结构参考。修复前另保留 76 张首屏图。画廊不为扩展模板虚构原版对应页。

## 修复内容

1. **页面框架**：Mirages 导航取消额外占位和通用 `Padding` 的叠加边距；桌面横幅内容按原版导航留出 60px 顶部空间。无封面横幅随明暗模式变化，正文恢复白色 / `#2c2a2a` 背景。
2. **列表和正文**：列表断点按 `headfix_pages.php` 对齐；手机列表边距由 48px 改为 12px。正文保留约 20px 手机边距，默认独立页面限制版心，移除首段前多余空白。正文采用桌面 16px / 28.8px、手机 14px / 25.2px，标题按比例缩放。
3. **正文细节**：取消继承的引用斜体和段落内边距；代码块去掉重复背景并随主题配色；暗色表头改为深色底，避免浅底浅字。
4. **样式范围**：相邻文章样式改用 `.adjacent-feeds`，避免命中所有 `sm:grid-cols-2` 的作品集、相册和简历网格。隐藏重复标题时保留草稿、未列出内容及动态发布入口。
5. **状态与操作**：搜索标题包含关键字；内容加载失败时横幅显示错误标题；友链、动态提供空态。恢复被 CSS 隐藏的主题切换和 RSS 按钮。
6. **缺失图片**：作者、评论、友链使用文字头像回退，移除对不存在的 `/avatar.png` 的依赖；有效图片仍保持固定尺寸，失败后不会显示破图。

7. **文章封面**：分类和标签接口补齐封面字段，供现有卡片展示；更新分类缓存版本，避免旧响应继续显示默认渐变。

## 补充验证

- 客户端测试：63 通过，0 失败；其中新增搜索标题/布局和三类内容加载失败的回归检查。
- 服务端测试：333 通过，0 失败；新增分类与标签封面有值/为空的四项回归检查。客户端、服务端 TypeScript 检查及 Vite 构建通过。
- 目录边界：390px 正常隐藏；1024、1280、1440、1920px 下目录完整位于视口内。
- 对照画廊的页面、尺寸、主题和修复前图片开关已在浏览器中验证；管理员首页的草稿/未列出入口及动态发布按钮可见。
- 页脚按钮可切换主题，深色表头实际颜色为文字 `rgb(214, 214, 214)`、背景 `rgb(57, 55, 55)`。
- 手机菜单打开、跳转分类、随路由关闭已验证。原生浏览器点击会重置模拟视口，移动菜单因此通过页面 DOM 点击事件验证；未据此声称真实手机触摸手势已验收。
- 此前数据库迁移和本地 API 验证见[内容模型验收记录](typecho-mirages-verification.md)。

## 明确保留的差异

- Rin 的搜索、语言、登录入口、手机站名栏、页脚主题按钮仍保留；原版手机主要使用 `MENU` 按钮。因此导航和页脚不完全相同。
- 原版默认 404 为插画、搜索框和返回按钮；Rin 使用带错误标题的通用错误页。没有复制插画进产品。
- 归档、标签云、评论表单、作者信息、相邻文章、目录和时间/PV 文案采用 Rin 数据与组件。文章正文为目录保留空间，版心不要求与无目录参考完全重合；代码高亮和表格按 Rin 组件呈现。
- 仅保留原版字体栈，产品没有随本次提交重新分发主题包中的字体文件。实际西文字形会受可用字体影响。
- links、music 及其他扩展模板只验收共享框架和自身布局；它们不是原 PHP 模板或第三方插件的替代实现。
- 本次覆盖已列明的主题配置和合成内容。真实站点素材、极端长文本、其他主题选项组合及目标 Cloudflare 环境仍需结合实际数据验证。

## 重现与证据

[对照画廊](visual/mirages-7.10.6/index.html) 可直接在浏览器打开；图片和检查数据随仓库保存，不依赖临时目录或在线图片。

参考服务只读取使用者本机的原版主题：

```bash
MIRAGES_THEME_DIR='/absolute/path/to/Mirages' bun scripts/visual/mirages-reference.ts
```

将 [合成内容](../scripts/visual/mirages-fixture.json) 放入隔离的 Rin 测试实例，并准备表中路由。不要在生产库执行测试准备。参考服务默认仅监听 `127.0.0.1:15320`，可用 `MIRAGES_REFERENCE_PORT` 调整。

[捕获脚本](../scripts/visual/capture-mirages.mjs) 导出 `captureMirages({ task, root, rinOrigin, referenceOrigin })`，在已按 ego-browser 指南创建且具有 `p1`、`p2` 的 TaskSpace 中调用；调用者负责结束 TaskSpace。它仅浏览并导出 PDF，不创建数据或进行部署。

```js
const { captureMirages } = await import('file:///absolute/path/to/rin-blog/scripts/visual/capture-mirages.mjs');
await captureMirages({
  task: await taskSpace(yourTaskSpaceId),
  root: '/absolute/path/to/output',
  rinOrigin: 'http://127.0.0.1:15318',
  referenceOrigin: 'http://127.0.0.1:15320',
});
```

使用 [PDFKit 转图脚本](../scripts/visual/render-mirages.swift) 将导出的 PDF 转为 PNG，再使用 `cwebp` 压缩。需要保留固定视口、字体和媒体设置；换浏览器或系统后不要把栅格差异直接当作应用回归。
