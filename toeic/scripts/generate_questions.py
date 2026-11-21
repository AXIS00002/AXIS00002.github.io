#!/usr/bin/env python3
"""Append original TOEIC-style exercises to the public JSON feed.

Runs only in GitHub Actions when OPENAI_API_KEY exists as an Actions secret.
These are AI-generated drafts, not ETS/IIBC licensed questions.
"""
import json
import os
from pathlib import Path
from urllib.request import Request, urlopen
from datetime import datetime, timezone
from hashlib import sha256

ROOT = Path(__file__).resolve().parents[1]
TARGET = ROOT / "data" / "updates.json"
KEY = os.environ.get("OPENAI_API_KEY", "")
MODEL = os.environ.get("OPENAI_MODEL", "gpt-4.1-mini")

def valid(q):
    if not isinstance(q, dict):
        return False
    p = q.get("part")
    n = 3 if p == 2 else 4
    return (
        type(p) is int and 2 <= p <= 7
        and isinstance(q.get("question"), str) and 5 < len(q["question"]) < 600
        and isinstance(q.get("options"), list) and len(q["options"]) == n
        and all(isinstance(v, str) and 0 < len(v) < 800 for v in q["options"])
        and type(q.get("answer")) is int and 0 <= q["answer"] < n
        and isinstance(q.get("explanation"), str) and 3 < len(q["explanation"]) < 2000
        and len(str(q.get("stimulus", ""))) < 6000
        and len(str(q.get("audioText", ""))) < 6000
    )

def main():
    if not KEY:
        print("OPENAI_API_KEY not configured; leaving online question bank unchanged.")
        return
    data = json.loads(TARGET.read_text(encoding="utf-8"))
    existing = data.get("questions", [])
    if not isinstance(existing, list):
        raise ValueError("Existing question bank is malformed")
    prompt = """You write completely ORIGINAL, accurate English business-communication test practice.
Produce EXACTLY 12 TOEIC-style L&R questions, by Part: 2=2, 3=2, 4=2, 5=3, 6=1, 7=2.
Do not reproduce, paraphrase, or claim to reproduce any copyrighted ETS question.
Return ONLY raw JSON with top-level key "questions", with each element having:
part (integer), question (string), options (string array), answer (zero-based integer),
explanation (simplified Chinese, 30-80 characters explaining correctness),
stimulus (string), audioText (string), difficulty (string), topic (string).
Part 2: question is "Choose the best response to the spoken question.";
stimulus is a spoken English question; exactly 3 oral answer options; audioText contains
the question and three answers, labeled A/B/C.
Part 3: stimulus is an original 80-130-word workplace dialogue with speaker labels;
audioText is the dialogue; ask an inference or detail question with 4 options.
Part 4: stimulus is an original 80-120-word announcement or voicemail;
audioText is its spoken text, question and 4 options.
Part 5: question is one grammatically precise incomplete business sentence with _____;
stimulus and audioText are empty; 4 plausible options.
Part 6: stimulus is an original coherent 70-120-word email/notice with one [1] gap;
question asks "Which option best fits [1]?", 4 answer options.
Part 7: stimulus is an original 90-160-word workplace text; 4 answer options.
Each question MUST have exactly ONE clear correct answer. Rotate answer positions,
avoid ambiguity and contemporary factual claims. No answer explanation in English.
Do not use Markdown code fences. Return valid JSON only."""
    request = Request(
        "https://api.openai.com/v1/responses",
        data=json.dumps({"model": MODEL, "input": prompt, "max_output_tokens": 8500}).encode(),
        headers={"Content-Type": "application/json", "Authorization": "Bearer " + KEY},
        method="POST",
    )
    with urlopen(request, timeout=120) as response:
        body = json.loads(response.read().decode("utf-8"))
    output_text = "".join(
        block.get("text", "")
        for item in body.get("output", [])
        if item.get("type") == "message"
        for block in item.get("content", [])
        if block.get("type") == "output_text"
    ).strip()
    if output_text.startswith("&#96;&#96;&#96;"):  # defensive; normally plain JSON
        raise ValueError("Unexpected escaped Markdown response")
    if output_text.startswith(chr(96)*3):
        output_text = output_text.split("\n", 1)[-1].rsplit(chr(96)*3, 1)[0]
    generated = json.loads(output_text).get("questions", [])
    expected = {2:2, 3:2, 4:2, 5:3, 6:1, 7:2}
    if len(generated) != 12 or any(sum(q.get("part") == p for q in generated) != n for p, n in expected.items()):
        raise ValueError("Generated batch did not match the required Part distribution")
    if not all(valid(q) for q in generated):
        raise ValueError("Generated batch failed structure validation; file was not changed")
    seen = {sha256((str(q.get("question")) + "|" + str(q.get("stimulus", ""))).lower().encode()).hexdigest() for q in existing}
    appended = []
    for q in generated:
        fingerprint = sha256((q["question"] + "|" + str(q.get("stimulus", ""))).lower().encode()).hexdigest()
        if fingerprint in seen:
            continue
        seen.add(fingerprint)
        q["id"] = "ai-" + datetime.now(timezone.utc).strftime("%Y%m%d") + "-" + str(q["part"]) + "-" + fingerprint[:10]
        q["stimulus"] = str(q.get("stimulus") or "")
        q["audioText"] = str(q.get("audioText") or "")
        q["difficulty"] = str(q.get("difficulty") or "中等")
        q["topic"] = str(q.get("topic") or "商务英语")
        appended.append(q)
    if not appended:
        print("No distinct new questions were produced")
        return
    now = datetime.now(timezone.utc)
    result = {"generatedAt": now.isoformat(), "version": now.strftime("%Y-%m-%d"), "questions": (existing + appended)[-5000:]}
    temporary = TARGET.with_suffix(".tmp")
    temporary.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    temporary.replace(TARGET)
    print(f"Appended {len(appended)} new original practice questions.")
    print("Quality note: AI-created questions should be reviewed before high-stakes use.")

if __name__ == "__main__":
    main()
