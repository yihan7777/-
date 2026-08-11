#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[1]


def load(name):
    return json.loads((ROOT / "data" / name).read_text(encoding="utf-8"))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--date")
    args = parser.parse_args()
    target = args.date or datetime.now(ZoneInfo("Asia/Shanghai")).date().isoformat()
    plan, topics, part1, feedback = load("plan.json"), load("topics.json"), load("part1.json"), load("feedback.json")
    day = next((x for x in plan["days"] if x["date"] == target), None)
    if not day:
        print(f"No study plan for {target}; leaving the latest context unchanged")
        return
    tm = {x["id"]: x for x in topics}; pm = {x["id"]: x for x in part1}
    selected = list(dict.fromkeys(day["new_part2"] + day["review_part2"]))
    recent = feedback[-1] if feedback else None

    lines = [
        f"# IELTS Speaking Daily Context — {target}", "",
        "> 把本文件完整复制给 ChatGPT，然后开启 Live 语音。", "",
        "## 教练指令", "",
        "你是我的 IELTS Speaking 教练。严格按以下任务带练：Part 1 简短自然；Part 2 给我 1 分钟准备、2 分钟回答；Part 3 逐题追问。不要在我说话时打断。每轮结束后按 Fluency、Lexical Resource、Grammar、Pronunciation 四项给 0–9 分，并只挑 3 个最影响分数的问题纠正。最后输出可直接提交到 GitHub 的反馈摘要。", "",
        f"- 考试日期：{plan['exam_date']}", f"- 今日阶段：{day['phase']}", f"- 建议时长：{day['minutes']} 分钟", "",
        "## Part 1 热身", "",
    ]
    for pid in day["part1"]:
        p = pm[pid]; lines.append(f"### {pid} {p['title']}")
        lines.extend(f"- {q}" for q in p["questions"][:3]); lines.append("")
    lines.extend(["## Part 2 新题", ""])
    if day["new_part2"]:
        for tid in day["new_part2"]:
            t=tm[tid]; lines.extend([f"### {tid} {t['title_zh']} · {t['cluster_name']}", t["cue"], *[f"- {b}" for b in t["bullets"]], f"- 迁移骨架：{t['anchor']}", ""])
    else: lines.extend(["今天不增加新题。", ""])
    lines.extend(["## 到期复习", ""])
    if day["review_part2"]:
        lines.extend(f"- {tid} {tm[tid]['title_zh']}（脱稿回答；只看题眼，不看完整笔记）" for tid in day["review_part2"])
    else: lines.append("今天没有到期复习。")
    lines.extend(["", "## Part 3 追问池", ""])
    for tid in selected[:4]:
        for q in tm[tid]["part3"][:2]: lines.append(f"- {q}")
    if recent:
        lines.extend(["", "## 上次反馈，今天优先修正", "", f"- 日期：{recent.get('date','—')}", f"- 重点：{recent.get('next_focus') or recent.get('corrections') or '保持稳定输出'}"])
    lines.extend(["", "## 练习结束后请输出", "", "1. 四项分数及总分估计", "2. 三处原句 → 改进句", "3. 5 个可迁移表达", "4. 下一次只需改进的一件事", "5. 已完成题号（如 P2-01, P2-17）", ""])
    out = "\n".join(lines)
    folder = ROOT / "daily-context"; folder.mkdir(exist_ok=True)
    (folder / f"{target}.md").write_text(out, encoding="utf-8")
    (folder / "latest.md").write_text(out, encoding="utf-8")
    print(f"Generated context for {target}")


if __name__ == "__main__": main()
