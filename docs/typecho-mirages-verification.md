# Typecho 内容模型与 Mirages 主题验收记录

日期：2026-10-24。范围：Rin 的内容模型迁移、分类与独立页面管理，以及 Mirages 下的内容路由和页面模板。

## 本轮完成

- 分类聚合包含子分类的文章时按文章 ID 去重；旧分类环不会导致无限遍历。
- 分类和独立页面的父级必须存在、类型正确，不能指向自身、后代或无效的祖先链；存在子项时删除返回 409。
- 管理界面的父级选项排除自身及后代，旧数据中的环和孤儿节点仍可见，可改为顶级节点修复。
- 分类 slug 在分类命名空间内唯一；自动生成时追加序号，显式冲突返回 409，未提供 slug 的更新保留原值。
- 自定义字段保留原始输入，保存时解析 JSON 和数值；错误输入不会提交，JSON 对象可正常回显编辑。
- 页面编辑保留、替换和移除密码有明确行为；公开文章与页面解锁框使用密码输入框。
- Mirages 的文章、分类和页面标题使用对应页面已经读取的数据，避免 Hero 再次请求文章及重复增加 PV；覆盖 StrictMode、切换路由及解锁后的刷新。
- 分类使用列表布局，独立页面使用页面模板，移除独立页面的重复标题；修复中等桌面宽度下文章目录被裁切的问题。

## 自动检查

| 检查 | 结果 |
| --- | --- |
| 服务端测试 | 329 通过，0 失败 |
| 客户端测试 | 59 通过，0 失败 |
| 客户端与服务端 TypeScript 检查 | 通过 |
| Vite 前端构建 | 通过 |
| Worker 打包（Wrangler dry-run） | 通过 |

可重复运行的检查：

```bash
cd server
bun run test
bun run check
cd ../client
bun run test
bun run check
bun x vite build --mode development
```

主要回归测试位于：

- `server/src/services/__tests__/category.test.ts`
- `server/src/services/__tests__/page-hierarchy.test.ts`
- `client/src/page/__tests__/admin-pages.test.tsx`
- `client/src/page/__tests__/admin-categories.test.tsx`
- `client/src/app/__tests__/mirages-routes.test.tsx`
- `client/src/app/__tests__/use-app-bootstrap.test.tsx`

## 本地 D1 与完整 Worker 验证

使用隔离的临时目录、Wrangler 4.71.0 的 `--local` 模式及合成数据。

1. 空库执行 `0000` 至 `0014` SQL，迁移版本为 14，外键检查无错误。
2. 旧库执行 `0000` 至 `0010`，写入旧文章、标签关联、评论、访问记录和 PV/HLL 样本，再执行 `0011` 至 `0014`。文章 ID、标题、正文、slug、标签关联及评论/访问记录均保留；统计样本的 PV 为 123，HLL 原值保留，外键检查无错误。
3. 在完整 Worker 上完成 55 次 API 请求，覆盖管理员登录、配置、分类 slug 与层级、页面层级与删除保护、自定义字段、密码生命周期、分类文章去重、单次读取的 PV 增量、评论读写；另检查 RSS 包含公开文章。
4. 九种模板的字段写入及读取通过：`default`、`wide`、`portfolio`、`links`、`gallery`、`timeline`、`resume`、`music`、`docs`。

## 浏览器检查

在本地完整 Worker 上检查 16 条公开路由：九种页面模板，以及首页、分类、文章、时间线、动态、标签列表和友链。

- 1280px 与 390px、明暗两种模式，共 64 组加载检查通过。
- 检查 Hero 标题、正文加载、明暗模式、文档横向溢出，以及详情 API 是否重复请求。
- 目录边界额外检查 1024、1280、1440、1920px；可见目录均在视口内。390px 下目录正常隐藏。
- 受保护页面的密码输入遮掩、错误密码提示及成功解锁后的正文刷新通过实际浏览器交互验证；初次加载与成功解锁各读取一次页面详情。

## 验收边界

上述结果确认已列出的功能与本地迁移路径通过验证。它们不构成 Typecho 全部功能、PHP 主题/插件或外部 Typecho 数据导入的兼容性结论。

浏览器截图接口未能输出截图，系统也未开放屏幕捕获权限，因此尚未完成与原 Mirages 的逐页视觉对照。本轮完成的是 DOM、布局边界、加载和请求检查，不能据此宣称视觉还原达到 100%。目标 Cloudflare 环境及真实外部媒体资源的验收也尚未进行。
