import unittest
from collections import Counter

from generate_quizzes import (
    QUESTIONS_PER_TEST,
    TEST_COUNT,
    TOPICS,
    build_quiz_data,
    generate_tests,
    parse_questions,
)


class MarkdownParserTests(unittest.TestCase):
    def test_supports_bold_tag_lowercase_choices_and_wrapped_lines(self):
        markdown = "\n".join(
            [
                "Câu 1:[!b:$ Câu hỏi có bọc định dạng:$]",
                "a. Lựa chọn thứ nhất",
                "*b. Lựa chọn đúng",
                "   được xuống dòng",
                "c. Lựa chọn thứ ba",
                "d. Lựa chọn thứ tư",
            ]
        )

        parsed = parse_questions(markdown)
        self.assertEqual(len(parsed), 1)
        self.assertEqual(parsed[0]["text"], "Câu hỏi có bọc định dạng:")
        self.assertEqual(parsed[0]["options"][1]["text"], "Lựa chọn đúng được xuống dòng")
        self.assertEqual(parsed[0]["options"][1]["letter"], "B")
        self.assertTrue(parsed[0]["options"][1]["is_correct"])

    def test_rejects_missing_or_multiple_correct_answers(self):
        for options in (
            ["A. Một", "B. Hai", "C. Ba", "D. Bốn"],
            ["*A. Một", "*B. Hai", "C. Ba", "D. Bốn"],
        ):
            markdown = "\n".join(["Câu 1: Câu hỏi", *options])
            with self.subTest(options=options), self.assertRaisesRegex(
                ValueError, "đúng một đáp án"
            ):
                parse_questions(markdown, "invalid.md")

    def test_preserves_literal_brackets_and_rejects_nonsequential_questions(self):
        markdown = "\n".join(
            [
                "Câu 1: Câu hỏi [tham khảo]",
                "*A. Nội dung [đúng]",
                "B. Hai",
                "C. Ba",
                "D. Bốn",
            ]
        )
        parsed = parse_questions(markdown)
        self.assertEqual(parsed[0]["text"], "Câu hỏi [tham khảo]")
        self.assertEqual(parsed[0]["options"][0]["text"], "Nội dung [đúng]")

        with self.assertRaisesRegex(ValueError, "không liên tục"):
            parse_questions(markdown.replace("Câu 1:", "Câu 2:"), "gap.md")

    def test_position_dependent_answers_keep_their_source_letters(self):
        questions = [
            {
                "number": 1,
                "line": 1,
                "text": "Chọn phương án A theo nội dung câu hỏi",
                "options": [
                    {"letter": letter, "text": f"Phương án {letter}", "is_correct": letter == "A"}
                    for letter in "ABCD"
                ],
            }
        ]
        questions.extend(
            {
                "number": number,
                "line": number + 1,
                "text": f"Câu hỏi thứ {number}",
                "options": [
                    {"letter": letter, "text": f"Câu {number} - {letter}", "is_correct": letter == "B"}
                    for letter in "ABCD"
                ],
            }
            for number in range(2, 31)
        )

        test = generate_tests(questions, "test", seed=10)[0]
        fixed = next(question for question in test["questions"] if question["source_number"] == 1)
        self.assertEqual(fixed["correct_letter"], "A")
        self.assertEqual(
            [choice["text"] for choice in fixed["choices"]],
            [f"Phương án {letter}" for letter in "ABCD"],
        )


class GeneratedQuizTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.data = build_quiz_data()

    def test_each_markdown_topic_parses_without_invalid_questions(self):
        self.assertEqual(len(self.data["topics"]), len(TOPICS))
        for topic in TOPICS:
            with self.subTest(topic=topic["id"]):
                source = next(
                    item
                    for item in self.data["topics"]
                    if item["id"] == topic["id"]
                )
                self.assertEqual(source["question_count"], 140)
                self.assertEqual(source["test_count"], TEST_COUNT)

    def test_each_topic_has_seven_separate_tests_of_thirty_unique_questions(self):
        for topic in self.data["topics"]:
            with self.subTest(topic=topic["id"]):
                tests = self.data["tests"][topic["id"]]
                self.assertEqual(len(tests), TEST_COUNT)
                for test in tests:
                    self.assertEqual(len(test["questions"]), QUESTIONS_PER_TEST)
                    ids = [question["id"] for question in test["questions"]]
                    self.assertEqual(len(ids), len(set(ids)))
                    self.assertTrue(
                        all(question_id.startswith(f"{topic['id']}-") for question_id in ids)
                    )

    def test_source_question_banks_preserve_all_markdown_questions_and_answers(self):
        from pathlib import Path

        for topic in TOPICS:
            source = Path(__file__).parent / "topic" / topic["file"]
            original = parse_questions(
                source.read_text(encoding="utf-8-sig"), source.name
            )
            bank = self.data["banks"][topic["id"]]
            with self.subTest(topic=topic["id"]):
                self.assertEqual(len(bank), len(original))
                for bank_question, source_question in zip(bank, original):
                    self.assertEqual(bank_question["number"], source_question["number"])
                    self.assertEqual(bank_question["text"], source_question["text"])
                    self.assertEqual(bank_question["options"], source_question["options"])
                    self.assertEqual(
                        bank_question["correct_letter"],
                        next(
                            option["letter"]
                            for option in source_question["options"]
                            if option["is_correct"]
                        ),
                    )

    def test_generated_choices_keep_one_correct_answer_and_valid_labels(self):
        for topic in self.data["topics"]:
            for test in self.data["tests"][topic["id"]]:
                for question in test["questions"]:
                    with self.subTest(question=question["id"]):
                        self.assertEqual(
                            [choice["letter"] for choice in question["choices"]],
                            list("ABCD"),
                        )
                        self.assertIn(question["correct_letter"], "ABCD")
                        self.assertEqual(
                            len(
                                [
                                    choice
                                    for choice in question["choices"]
                                    if choice["letter"] == question["correct_letter"]
                                ]
                            ),
                            1,
                        )

    def test_correct_answer_positions_are_balanced_per_test(self):
        for topic in self.data["topics"]:
            for test in self.data["tests"][topic["id"]]:
                distribution = Counter(
                    question["correct_letter"] for question in test["questions"]
                )
                with self.subTest(topic=topic["id"], test=test["number"]):
                    self.assertLessEqual(max(distribution.values()), 8)
                    self.assertGreaterEqual(min(distribution[letter] for letter in "ABCD"), 7)

    def test_correct_answers_and_choice_text_match_the_markdown_source(self):
        from pathlib import Path

        for topic in TOPICS:
            source = Path(__file__).parent / "topic" / topic["file"]
            original = {
                question["number"]: question
                for question in parse_questions(
                    source.read_text(encoding="utf-8-sig"), source.name
                )
            }
            for test in self.data["tests"][topic["id"]]:
                for generated in test["questions"]:
                    source_question = original[generated["source_number"]]
                    source_correct = next(
                        option["text"]
                        for option in source_question["options"]
                        if option["is_correct"]
                    )
                    generated_correct = next(
                        choice["text"]
                        for choice in generated["choices"]
                        if choice["letter"] == generated["correct_letter"]
                    )
                    with self.subTest(question=generated["id"]):
                        self.assertEqual(generated_correct, source_correct)
                        self.assertEqual(
                            {choice["text"] for choice in generated["choices"]},
                            {option["text"] for option in source_question["options"]},
                        )

    def test_source_questions_are_covered_and_repetition_is_balanced(self):
        for topic in self.data["topics"]:
            with self.subTest(topic=topic["id"]):
                appearances = Counter(
                    question["source_number"]
                    for test in self.data["tests"][topic["id"]]
                    for question in test["questions"]
                )
                self.assertEqual(len(appearances), topic["question_count"])
                self.assertEqual(set(appearances.values()), {1, 2})
                self.assertEqual(
                    sum(count == 2 for count in appearances.values()), 70
                )

    def test_generation_is_deterministic(self):
        from generate_quizzes import parse_questions
        from pathlib import Path

        source = Path(__file__).parent / "topic" / TOPICS[0]["file"]
        parsed = parse_questions(source.read_text(encoding="utf-8-sig"))
        first = generate_tests(parsed, TOPICS[0]["id"], seed=123)
        second = generate_tests(parsed, TOPICS[0]["id"], seed=123)
        self.assertEqual(first, second)


if __name__ == "__main__":
    unittest.main()
