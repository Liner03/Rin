---
target: 评论区（feed.tsx CommentInput/Comments/CommentItem + dialog.tsx）
total_score: 19
max_score: 40
na_heuristics: 
p0_count: 1
p1_count: 2
timestamp: 2026-08-15T11-37-32Z
slug: client-src-page-feed-tsx
---
# 评论区设计评审（Mirages 博客）

## Design Health Score: 19/40 (Poor)

| # | 启发式 | 分数 | 关键问题 |
|---|--------|------|---------|
| 1 | 系统状态可见性 | 2 | 评论列表无加载态；成功用"Alert"弹窗 |
| 2 | 匹配真实世界 | 2 | 成功叫"Alert"；邮箱/网址字段无解释 |
| 3 | 用户控制与自由 | 3 | 删除有确认、遮罩可关；无编辑、无取消 |
| 4 | 一致性与标准 | 1 | 同屏三种输入框、胶囊 vs 直角按钮、圆角混用 |
| 5 | 错误预防 | 2 | 昵称有预检；无字数限制、无邮箱/URL 校验、无双击防护 |
| 6 | 识别而非回忆 | 3 | 字段可见；游客每次重填身份 |
| 7 | 灵活高效 | 1 | 无回复、无计数、无 Ctrl+Enter |
| 8 | 美学与极简 | 2 | 无空状态、无评论数、成功弹窗噪音 |
| 9 | 错误恢复 | 2 | errorHumanize + 重载按钮好；错误在表单底部 |
| 10 | 帮助与文档 | 1 | 无隐私提示、无引导 |

## 设计特异性判定

类别通用，不是 Mirages。正文卡片透明/0圆角/642px；评论区全宽 bg-w rounded-2xl 白卡。无 5px 圆角、无虚线 #eee 分隔、无透明表面。三种互斥输入样式同表单。默认主题遗留组件族。

## 优先问题

- **P0 — 成功 = "Alert" 弹窗阻塞结果**（feed.tsx:443, dialog.tsx:65）：提交后弹窗"Alert"强制点击。→ 内联"评论已发布"+自动刷新+滚动定位。
- **P1 — 输入系统未建立**（feed.tsx:487,501-517）：无边框文本框、gray-200 游客框、无 focus ring。→ 统一全局 Input 风格。
- **P1 — Mirages 风格断裂**：全宽白卡 12px 圆角 vs 642px 透明正文。→ 限宽 642px、透明卡+虚线分隔。
- **P2 — 表单优先、无计数、无空状态**（feed.tsx:589-600）。→ "N 条评论"、列表置前、空状态文案。
- **P2 — 游客负担**：3 无解释字段、无隐私提示、无登录入口。→ 折叠"更多选项"。

## Persona 红旗

- Jordan：5 无标签字段 + "Alert"成功弹窗；错误提交后才出现
- Casey：px-2 py 非法 class 致 21px 触摸目标；popup 可能溢出
- Riley：无双击防护；无 maxlength；删除双弹窗

## Minor

justify-center+items-end 矛盾；bg-secondary bg-button 冗余；双 h1 错误卡；评论宽度无视 642px；无 label/aria-label；红 500 对比 3.3:1；gray-400 2.8:1；触摸目标 <44px；弹窗无焦点陷阱；无空状态。

## 问题

1. 评论是唯一游客转化面，为何用最重的报错式反馈？
2. Mirages 原版列表置前+计数，为何丢弃？
3. 单字段"昵称+折叠更多"会破坏什么？
