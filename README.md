# IELTS Speaking 2026 · 9 月 1 日冲刺系统

这套系统把 2026 年 5–8 月题库中的 **32 个 Part 1 主题、49 道 Part 2 题目及对应 Part 3 追问**，整理为 8 个可迁移故事骨架，并按照 **D+1 / D+3 / D+7 / D+14** 安排复习。

## 每天怎么用

1. 打开可视化面板，看“今天只做这些”。
2. 点击 **复制今日 Context**，全文复制给 ChatGPT，然后开启 Live 语音。
3. 完成 Part 1 → Part 2 → Part 3 练习，等 ChatGPT 输出评分和反馈摘要。
4. 点击 **提交 Live 反馈**，把摘要填入 Issue；GitHub Actions 会自动更新 `data/feedback.json`、`data/progress.json` 和下一轮 Context。

## 自动化

- 每天北京时间 08:00 生成 `daily-context/latest.md`。
- 新建带 `practice-feedback` 标签的反馈 Issue 后，自动同步练习记录。
- `main` 分支更新后自动部署 GitHub Pages。

## 计划原则

- 8 月 11–18 日：每天建立 1 个故事骨架，覆盖该组所有 Part 2 题目。
- 8 月 12 日起：按照 D+1、D+3、D+7、D+14 脱稿复现。
- 8 月 23–31 日：进入完整模考与薄弱项回炉。
- 9 月 1 日：只做轻量热身，不再增加新内容。

数据来自用户提供的《2026 年 5–8 月雅思口语神奇题库第三版（视频口语）》。本仓库用于个人备考。
