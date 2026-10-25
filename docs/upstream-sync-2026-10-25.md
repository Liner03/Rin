# 上游同步验收记录

日期：2026-10-25。

本次将 `openRin/Rin:main` 的更新合入 fork 的本地分支 `sync/upstream-main-20261025`，保留 Typecho 内容模型和 Mirages 定制。

- fork 基点：`1ee28ad49cc199c6afe4bbc961c72e4ed0c3f431`（`Liner03/Rin` 的 PR #2 合并结果）。
- 上游基点：`308a542df6165bbf757fad111d7f8ab6296db771`。
- 上游新增历史：31 个提交，包含合并提交。
- 同步采用 merge，保留双方提交历史。本轮只创建本地合并提交，未推送或部署。

## 合并取舍

无文本冲突的改动也需要检查行为兼容性；涉及内容模型或主题的改动按 fork 的实际实现适配。

| 范围 | 结果 |
| --- | --- |
| 搜索 | 吸收数据库分页与计数，适配 `contents`；去掉 200 条截断，正确处理中文和 `%`、`_`、反斜杠字面量，修复路由参数重复解码 |
| sitemap / robots / RSS | 吸收 canonical URL 与存储缓存策略；sitemap 使用文章、独立页面、分类及标签的现有路由，只包含可公开索引的内容 |
| API 边界 | 吸收请求校验和权限包装，保留文章作者权限、分类、封面、密码、状态、slug 和 AI 摘要行为 |
| 标签与缓存 | 吸收批量查询和关系写入，按 D1 参数限制分批，保留分类关系；结合部分缓存读写与延迟失效，覆盖数据库和 S3 两种模式 |
| UI | 吸收共享 Modal、加载/失败反馈、图片失败占位和长文本布局；保留 Mirages 页面框架、卡片、头像回退与目录滚动行为 |
| 工具链 | 接入上游 Bun 测试运行器，保留 fork 的回归用例；本地与 CI 固定 Bun 1.3.14，并使用 `--isolate` 隔离模块模拟 |

Mirages 样式必须在共享 UI 样式之后导入。视觉检查发现并修复了冲突处理时遗漏的 `@import "./mirages.css"`。

## 数据库迁移

fork 的 `0011`–`0014` SQL 保持原义及原内容，上游同号迁移不会覆盖它们。新增 [0015.sql](../server/sql/0015.sql)，将上游查询索引适配到 `contents`、`metas`、`relationships` 等当前表，并将版本更新为 15。

保留上游对旧 `feeds.top` 的预检修复：只有 `feeds` 存在且缺少该列时才添加；已迁移到内容模型的数据库跳过此步骤。新库的 `0000.sql` 直接包含 `top`。

迁移回归覆盖没有 `top`、已有 `top`、旧值为空等情况，以及文章、标签关系、评论、访问记录、PV 和 HLL 数据升级至 15 后的保留。实际本地 D1 从空库执行 `0000`–`0015` 成功，版本为 15，`PRAGMA foreign_key_check` 无错误。

## 验证结果

| 检查 | 结果 |
| --- | --- |
| `bun run test` | 551 通过，0 失败，58 个文件 |
| 单独运行客户端测试 | 80 通过，0 失败 |
| 单独运行服务端测试 | 368 通过，0 失败 |
| `bun run check` | 客户端、服务端、CLI 类型检查通过 |
| `bun run build:client` | 生产构建通过；Mirages 导入修复后已重新构建 |
| Wrangler 4.71.0 Worker dry-run | 打包通过 |
| 本地完整 Worker | sitemap、robots、RSS、文章、评论、字面量 `%` 搜索均返回 200 |
| `git diff --check` | 通过 |

根测试包含客户端、服务端及其他包的用例；各行测试数不累加。`format:check` 虽退出成功，但 Turbo 未找到格式化任务，不能视为完成格式检查。Turbo 存在 Bun lockfile 解析警告，Vite 存在大 bundle 提示，两者未阻断本轮检查。

关键回归用例：

- [旧数据迁移](../server/tests/migrations/content-model.test.ts)和 [top 字段兼容](../scripts/__tests__/feeds-top-migration.test.ts)。
- [搜索分页与可见性](../server/src/services/__tests__/search.test.ts)、[标签批量写入](../server/src/services/__tests__/tag-write.test.ts)。
- [缓存失效与字面量匹配](../server/src/utils/__tests__/cache.test.ts)、[sitemap](../server/src/services/__tests__/sitemap.test.ts)、[RSS](../server/src/services/__tests__/rss.test.ts)。
- [目录滚动保留](../client/src/hooks/__tests__/use-table-of-contents.test.tsx)和现有 Mirages 路由、分类及页面管理回归。

## 浏览器复核

使用隔离的本地 Worker / D1、合成文章和用户，在浏览器中检查首页、文章、独立页面、分类、搜索、友链和动态。

- 1280px 桌面下首页与文章布局正常；390px 下所检查页面没有文档横向溢出。
- Mirages 字体、浅色与深色背景生效，桌面 Hero 高 445px，移动 Hero 高 338px。
- 友链编辑 Modal 在 1280px 和 390px 视口均完整显示，宽度分别为 640px 和 358px；打开时锁定正文滚动，Escape 关闭后恢复。
- 稳定动画后检查首页、桌面文章、深色移动文章和编辑弹窗的整页渲染，正文、卡片、评论及弹窗均可见。

本轮图像使用浏览器 screen 媒体模式的 PDF 导出再栅格化，移动检查采用视口模拟。它补充了[既有 Mirages 7.10.6 逐页对照](mirages-visual-comparison.md)，不替代真机或目标 Cloudflare 环境验收；本轮未重新执行完整的 76 组视觉矩阵。
