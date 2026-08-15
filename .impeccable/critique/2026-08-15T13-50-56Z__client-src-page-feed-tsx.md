---
target: 评论区第2轮（feed.tsx 评论区 + dialog.tsx）
total_score: 17
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 2
timestamp: 2026-08-15T13-50-56Z
slug: client-src-page-feed-tsx
---
# 评论区设计评审（第 2 轮）— 17/40 Poor

## 核心问题
- P1 评论区 848px vs 正文 642px 错位（mirages.css:125 只约束 main>article）
- P1 focus:ring-theme/10 焦点不可见（1.2:1）
- P2 亮色 neutral-400 2.4:1 集体失败（76682ed 只修暗色）
- P2 提交按钮白字 on 主题色 3.4:1
- P2 触摸目标 19.5-36px 全 <44px
- P3 全角括号硬编码；新评论插顶用户找不到；setTimeout 无清理

## 启发式
1:1, 2:1, 3:1, 4:2, 5:2, 6:1, 7:2, 8:2, 9:2, 10:3

## 亮点
虚线分隔+计数标题+紧凑字号唤起 Mirages；内联 role="alert" 反馈；删除交互完整

## 待确认
- 亮色输入框是否要 Mirages 透光纸感（bg-w 实白 vs 透明）
- 新评论排序：置顶 vs 时间正序
