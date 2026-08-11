#!/usr/bin/env python3
from __future__ import annotations

import json, os, re, subprocess
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def section(body, heading):
    m = re.search(rf"### {re.escape(heading)}\s*\n+(.+?)(?=\n### |\Z)", body, re.S)
    return m.group(1).strip() if m else ""


def score(text):
    m = re.search(r"\b([0-9](?:\.5)?)\b", text)
    return float(m.group(1)) if m else None


def main():
    body = os.environ.get("ISSUE_BODY", "")
    issue = int(os.environ.get("ISSUE_NUMBER", "0"))
    topics_path, feedback_path, progress_path = ROOT/"data/topics.json", ROOT/"data/feedback.json", ROOT/"data/progress.json"
    valid = {x["id"] for x in json.loads(topics_path.read_text(encoding="utf-8"))}
    completed_text = section(body, "完成的 Part 2 题号")
    completed = sorted(set(re.findall(r"P2-\d{2}", completed_text.upper())) & valid)
    entry = {
        "issue": issue,
        "date": section(body, "练习日期"),
        "completed_topics": completed,
        "scores": {
            "fluency": score(section(body, "Fluency 分数")),
            "lexical": score(section(body, "Lexical Resource 分数")),
            "grammar": score(section(body, "Grammar 分数")),
            "pronunciation": score(section(body, "Pronunciation 分数")),
        },
        "corrections": section(body, "关键纠错"),
        "expressions": section(body, "可迁移表达"),
        "next_focus": section(body, "下一次只改进这一件事"),
        "synced_at": datetime.now(timezone.utc).isoformat(),
    }
    feedback = json.loads(feedback_path.read_text(encoding="utf-8"))
    feedback = [x for x in feedback if x.get("issue") != issue] + [entry]
    feedback_path.write_text(json.dumps(feedback, ensure_ascii=False, indent=2)+"\n", encoding="utf-8")
    progress = json.loads(progress_path.read_text(encoding="utf-8"))
    for tid in completed:
        item = progress["topics"].setdefault(tid, {"sessions": 0})
        item["sessions"] += 1; item["last_practiced"] = entry["date"]
    progress["updated_at"] = entry["synced_at"]
    progress_path.write_text(json.dumps(progress, ensure_ascii=False, indent=2)+"\n", encoding="utf-8")
    if entry["date"]:
        subprocess.run(["python3", str(ROOT/"scripts/generate_daily_context.py"), "--date", entry["date"]], check=False)
    print(f"Synced issue #{issue}: {len(completed)} topics")


if __name__ == "__main__": main()
