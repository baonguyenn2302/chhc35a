#!/usr/bin/env python3
"""Build seven independent 30-question quizzes for each Markdown topic."""

from __future__ import annotations

import html
import json
import random
import re
import sys
from collections import Counter
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parent
TOPIC_DIR = ROOT / "topic"
OUTPUT = ROOT / "quiz_data.js"
QUESTIONS_PER_TEST = 30
TEST_COUNT = 7
LETTERS = "ABCD"
TOPICS = (
    {
        "id": "mac-lenin",
        "title": "Chủ nghĩa Mác - Lênin về chiến tranh và quân đội",
        "file": "cn_mac_lenin_ve_chientranh_va_quandoi.md",
    },
    {
        "id": "ho-chi-minh",
        "title": "Tư tưởng Hồ Chí Minh về quân sự và quốc phòng",
        "file": "tt_hcm_ve_quánu_va_quocphong.md",
    },
)

QUESTION_RE = re.compile(r"^Câu\s+(\d+)\s*[:.]\s*(.*)$", re.IGNORECASE)
OPTION_RE = re.compile(r"^(\*)?([A-D])[\.)]\s*(.*)$", re.IGNORECASE)
MARKUP_PREFIX_RE = re.compile(r"^\[!b:\s*\$?", re.IGNORECASE)
POSITION_REFERENCE_RE = re.compile(
    r"\b(?:đáp án|phương án|lựa chọn)\s+[A-D]\b"
    r"|\bcả\s+[A-D]\s*(?:và|,)\s*[A-D]\b",
    re.IGNORECASE,
)


def clean_markup(value: str) -> str:
    value = value.strip()
    if MARKUP_PREFIX_RE.match(value):
        value = MARKUP_PREFIX_RE.sub("", value, count=1)
        if value.endswith("]"):
            value = value[:-1]
            if value.endswith("$"):
                value = value[:-1]
    value = html.unescape(value)
    return re.sub(r"\s+", " ", value).strip()


def parse_questions(markdown: str, source_name: str = "Markdown") -> list[dict[str, Any]]:
    questions: list[dict[str, Any]] = []
    current: dict[str, Any] | None = None

    def finish_question() -> None:
        if current is None:
            return
        question_number = current["number"]
        prefix = f"{source_name}: câu {question_number} (dòng {current['line']})"
        options = current["options"]
        if not current["text"]:
            raise ValueError(f"{prefix}: nội dung câu hỏi trống")
        if len(options) != 4:
            raise ValueError(f"{prefix}: cần đúng 4 phương án, tìm thấy {len(options)}")
        labels = [option["letter"] for option in options]
        if sorted(labels) != list(LETTERS):
            raise ValueError(f"{prefix}: nhãn phương án phải đủ A, B, C, D")
        correct_options = [option for option in options if option["is_correct"]]
        if len(correct_options) != 1:
            raise ValueError(
                f"{prefix}: cần đúng một đáp án được đánh dấu *, "
                f"tìm thấy {len(correct_options)}"
            )
        for option in options:
            if not option["text"]:
                raise ValueError(f"{prefix}: phương án {option['letter']} bị trống")
        questions.append(current)

    for line_number, raw_line in enumerate(markdown.splitlines(), start=1):
        line = raw_line.strip()
        if not line:
            continue

        question_match = QUESTION_RE.match(line)
        if question_match:
            finish_question()
            title = clean_markup(question_match.group(2))
            current = {
                "number": int(question_match.group(1)),
                "line": line_number,
                "text": title,
                "options": [],
            }
            continue

        if current is None:
            continue

        wrapped_bold = line.startswith("[!b:")
        normalized_line = clean_markup(line)
        option_match = OPTION_RE.match(normalized_line)
        if option_match:
            current["options"].append(
                {
                    "letter": option_match.group(2).upper(),
                    "text": clean_markup(option_match.group(3)),
                    "is_correct": bool(option_match.group(1)) or wrapped_bold,
                }
            )
            continue

        if current["options"]:
            current["options"][-1]["text"] = clean_markup(
                f"{current['options'][-1]['text']} {normalized_line}"
            )
        else:
            current["text"] = clean_markup(f"{current['text']} {normalized_line}")

    finish_question()
    if not questions:
        raise ValueError(f"{source_name}: không tìm thấy câu hỏi nào")

    numbers = [question["number"] for question in questions]
    if len(set(numbers)) != len(numbers):
        raise ValueError(f"{source_name}: số thứ tự câu hỏi bị trùng")
    if numbers != list(range(1, len(numbers) + 1)):
        raise ValueError(f"{source_name}: số thứ tự câu hỏi không liên tục")
    return questions


def has_position_references(question: dict[str, Any]) -> bool:
    content = " ".join(
        [question["text"], *(option["text"] for option in question["options"])]
    )
    return bool(POSITION_REFERENCE_RE.search(content))


def generate_tests(
    questions: list[dict[str, Any]], topic_id: str, seed: int
) -> list[dict[str, Any]]:
    if len(questions) < QUESTIONS_PER_TEST:
        raise ValueError(
            f"Chủ đề {topic_id} cần ít nhất {QUESTIONS_PER_TEST} câu, "
            f"hiện có {len(questions)}"
        )

    rng = random.Random(seed)
    appearances: Counter[int] = Counter()
    tests: list[dict[str, Any]] = []

    for test_number in range(1, TEST_COUNT + 1):
        randomized_pool = questions.copy()
        rng.shuffle(randomized_pool)
        randomized_pool.sort(key=lambda question: appearances[question["number"]])
        selected = randomized_pool[:QUESTIONS_PER_TEST]
        rng.shuffle(selected)

        fixed_questions = [question for question in selected if has_position_references(question)]
        correct_position_counts: Counter[str] = Counter()
        for question in fixed_questions:
            correct = next(option for option in question["options"] if option["is_correct"])
            correct_position_counts[correct["letter"]] += 1

        generated_questions = []
        for question in selected:
            correct_option = next(
                option for option in question["options"] if option["is_correct"]
            )

            if question in fixed_questions:
                choices = [
                    {"letter": option["letter"], "text": option["text"]}
                    for option in sorted(question["options"], key=lambda item: item["letter"])
                ]
                correct_letter = correct_option["letter"]
            else:
                least_used = min(correct_position_counts[letter] for letter in LETTERS)
                candidate_letters = [
                    letter
                    for letter in LETTERS
                    if correct_position_counts[letter] == least_used
                ]
                correct_letter = rng.choice(candidate_letters)
                correct_position_counts[correct_letter] += 1

                distractors = [
                    option["text"]
                    for option in question["options"]
                    if not option["is_correct"]
                ]
                rng.shuffle(distractors)
                choices = []
                distractor_index = 0
                for letter in LETTERS:
                    if letter == correct_letter:
                        choices.append({"letter": letter, "text": correct_option["text"]})
                    else:
                        choices.append(
                            {"letter": letter, "text": distractors[distractor_index]}
                        )
                        distractor_index += 1

            generated_questions.append(
                {
                    "id": f"{topic_id}-q{question['number']}",
                    "number": len(generated_questions) + 1,
                    "source_number": question["number"],
                    "text": question["text"],
                    "choices": choices,
                    "correct_letter": correct_letter,
                }
            )
            appearances[question["number"]] += 1

        tests.append(
            {
                "number": test_number,
                "title": f"Đề {test_number}",
                "questions": generated_questions,
            }
        )

    return tests


def build_quiz_data() -> dict[str, Any]:
    topics = []
    tests: dict[str, list[dict[str, Any]]] = {}
    banks: dict[str, list[dict[str, Any]]] = {}
    for topic_index, topic in enumerate(TOPICS):
        source = TOPIC_DIR / topic["file"]
        questions = parse_questions(
            source.read_text(encoding="utf-8-sig"), source.name
        )
        banks[topic["id"]] = [
            {
                "id": f"{topic['id']}-source-q{question['number']}",
                "number": question["number"],
                "text": question["text"],
                "options": question["options"],
                "correct_letter": next(
                    option["letter"]
                    for option in question["options"]
                    if option["is_correct"]
                ),
            }
            for question in questions
        ]
        topic_tests = generate_tests(
            questions, topic["id"], seed=20261105 + topic_index
        )
        topics.append(
            {
                "id": topic["id"],
                "title": topic["title"],
                "question_count": len(questions),
                "test_count": len(topic_tests),
                "questions_per_test": QUESTIONS_PER_TEST,
            }
        )
        tests[topic["id"]] = topic_tests
    return {"topics": topics, "tests": tests, "banks": banks}


def main() -> int:
    try:
        data = build_quiz_data()
        OUTPUT.write_text(
            "window.QUIZ_DATA = "
            + json.dumps(data, ensure_ascii=False, separators=(",", ":"))
            + ";\n",
            encoding="utf-8",
        )
    except (OSError, ValueError) as error:
        print(f"Lỗi tạo bộ đề: {error}", file=sys.stderr)
        return 1

    print(f"Đã tạo {OUTPUT.name}:")
    for topic in data["topics"]:
        print(
            f"- {topic['title']}: {topic['question_count']} câu nguồn, "
            f"{topic['test_count']} đề x {topic['questions_per_test']} câu"
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
