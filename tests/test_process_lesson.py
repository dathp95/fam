"""Tests for process_lesson.py (unittest, standard library only).

Run from the repo root:  python -m unittest discover -s tests -v

The splitting / silence / alignment tests compare against tests/segment_vectors.json, which is
generated from the real TypeScript code (node tests/gen_segment_vectors.mjs), so the Python port is
checked against the app itself. The end-to-end tests need ffmpeg and are skipped without it.
"""

from __future__ import annotations

import array
import json
import math
import os
import sys
import tempfile
import unittest
import wave
from pathlib import Path
from unittest import mock

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

import process_lesson as pl  # noqa: E402

VECTORS = json.loads((Path(__file__).parent / "segment_vectors.json").read_text(encoding="utf-8"))
FFMPEG = pl.find_tool("ffmpeg")
FFPROBE = pl.find_tool("ffprobe")


def signal(sample_rate: int, segments: list[list[float]]) -> array.array:
    """Same synthetic signal as tests/gen_segment_vectors.mjs: amp * sin(i * 0.37) as float32."""
    out = array.array("f")
    i = 0
    for seconds, amp in segments:
        for _ in range(math.floor(seconds * sample_rate + 0.5)):
            out.append(amp * math.sin(i * 0.37))
            i += 1
    return out


def good_lesson(**over) -> dict:
    lesson = pl.build_lesson(
        "test-l01",
        pl.Meta("Test", "https://example.com/x", "Topic", "A1", None, False),
        10.0,
        [
            {"text": "Hello there.", "start": 0.0, "end": 4.0},
            {"text": "How are you?", "start": 4.0, "end": 9.5},
        ],
        1700000000000,
    )
    lesson.update(over)
    return lesson


# ------------------------------------------------------------------------------ transcript cleaning
class CleanTranscriptTests(unittest.TestCase):
    def clean(self, raw: str) -> str:
        return pl.clean_transcript(raw)[0]

    def test_curly_apostrophes_and_quotes_become_ascii(self):
        self.assertEqual(self.clean("I’m fine. It‘s ‛ok’."), "I'm fine. It's 'ok'.")

    def test_double_quotes_are_removed(self):
        self.assertEqual(self.clean('He said “hello” and "bye".'), "He said hello and bye.")
        self.assertNotIn('"', self.clean("«a» „b“ ‟c” ″d″."))

    def test_ellipsis_is_replaced_by_a_space(self):
        self.assertEqual(self.clean("Well... I think… yes."), "Well I think yes.")
        self.assertEqual(self.clean("Wait.... what?"), "Wait what?")

    def test_two_dots_are_kept(self):
        self.assertIn("..", self.clean("Odd.. but ok."))

    def test_speaker_labels_are_stripped(self):
        self.assertEqual(self.clean("Anna: Hello there.\nPete: Hi, Anna."), "Hello there. Hi, Anna.")
        self.assertEqual(self.clean("Mr. Smith: Good morning."), "Good morning.")
        self.assertEqual(self.clean("Mary Ann: Welcome."), "Welcome.")

    def test_labels_longer_than_two_words_are_kept(self):
        self.assertIn("Mr John Smith:", self.clean("Mr John Smith: Hello."))

    def test_lowercase_or_inline_colons_are_not_labels(self):
        self.assertEqual(self.clean("Remember: it is late."), "it is late.")  # a one-word "label" at line start
        self.assertEqual(self.clean("It is simple: just listen."), "It is simple: just listen.")
        self.assertEqual(self.clean("the time: 5 pm."), "the time: 5 pm.")

    def test_a_time_or_number_after_the_colon_still_counts_as_label_text(self):
        self.assertEqual(self.clean("Lesson 2: At home."), "Lesson 2: At home.")  # "2" is not a capitalised word

    def test_lines_are_joined_with_spaces(self):
        self.assertEqual(self.clean("One.\nTwo.\n\n  Three.  \n"), "One. Two. Three.")

    def test_windows_and_old_mac_line_endings(self):
        self.assertEqual(self.clean("One.\r\nTwo.\rThree."), "One. Two. Three.")

    def test_lines_without_final_punctuation_get_a_period_and_are_reported(self):
        text, added = pl.clean_transcript("Hello there\nHow are you?\nI am fine\nGoodbye!")
        self.assertEqual(text, "Hello there. How are you? I am fine. Goodbye!")
        self.assertEqual(added, ["Hello there.", "I am fine."])

    def test_no_period_is_added_when_every_line_ends_a_sentence(self):
        self.assertEqual(pl.clean_transcript("A.\nB?\nC!")[1], [])

    def test_a_line_ending_with_a_comma_continues_on_the_next_line(self):
        text, added = pl.clean_transcript("I live here,\nand I like it.")
        self.assertEqual(text, "I live here, and I like it.")
        self.assertEqual(added, [])

    def test_a_trailing_comma_on_the_last_line_becomes_a_period(self):
        text, added = pl.clean_transcript("Welcome to my home.\nMy new apartment,")
        self.assertEqual(text, "Welcome to my home. My new apartment.")
        self.assertEqual(added, ["My new apartment."])

    def test_closing_brackets_after_the_period_count_as_ended(self):
        self.assertEqual(pl.clean_transcript("He left (quickly.)")[1], [])

    def test_separator_lines_are_dropped(self):
        self.assertEqual(self.clean("One.\n-----\nTwo."), "One. Two.")

    def test_empty_input(self):
        self.assertEqual(pl.clean_transcript(""), ("", []))
        self.assertEqual(pl.clean_transcript("  \n \n"), ("", []))

    def test_non_breaking_space_is_a_space(self):
        self.assertEqual(self.clean("Hello there."), "Hello there.")


# ------------------------------------------------------------------------------ port parity
class SplitSentencesParityTests(unittest.TestCase):
    def test_matches_the_typescript_implementation_on_every_vector(self):
        for case in VECTORS["split"]:
            with self.subTest(text=case["text"][:50]):
                self.assertEqual(pl.split_sentences(case["text"]), case["out"])

    # The cases of src/lib/segment.test.ts, spelled out so a failure is easy to read.
    def test_basic_punctuation(self):
        self.assertEqual(pl.split_sentences("Hello there. How are you? I am fine!"), ["Hello there.", "How are you?", "I am fine!"])
        self.assertEqual(pl.split_sentences("  One   two.\n\nThree four  "), ["One two.", "Three four"])
        self.assertEqual(pl.split_sentences(""), [])
        self.assertEqual(pl.split_sentences("   \n "), [])

    def test_decimals_prices_and_times_are_not_split(self):
        self.assertEqual(pl.split_sentences("The ticket costs 5.5 dollars."), ["The ticket costs 5.5 dollars."])
        self.assertEqual(pl.split_sentences("It is $3.50. We leave at 9.30 sharp."), ["It is $3.50.", "We leave at 9.30 sharp."])
        self.assertEqual(pl.split_sentences("I am 25. You are 30."), ["I am 25.", "You are 30."])

    def test_titles_and_am_pm(self):
        self.assertEqual(pl.split_sentences("Mr. Smith and Dr. Lee arrive at 9 a.m. today."), ["Mr. Smith and Dr. Lee arrive at 9 a.m. today."])
        self.assertEqual(pl.split_sentences("It is 5 p.m. We go home."), ["It is 5 p.m.", "We go home."])

    def test_dotted_abbreviations(self):
        self.assertEqual(pl.split_sentences("I live in Washington, D.C. and I like it very much."), ["I live in Washington, D.C. and I like it very much."])
        self.assertEqual(pl.split_sentences("I live in Washington, D.C. Anna lives there too."), ["I live in Washington, D.C.", "Anna lives there too."])
        self.assertEqual(pl.split_sentences("She works in the U.S."), ["She works in the U.S."])

    def test_eg_ie_vs_etc(self):
        self.assertEqual(pl.split_sentences("Eat fruit, e.g. Apples are good."), ["Eat fruit, e.g. Apples are good."])
        self.assertEqual(pl.split_sentences("It is cheap, i.e. Free."), ["It is cheap, i.e. Free."])
        self.assertEqual(pl.split_sentences("We eat rice, fish, etc. and drink tea."), ["We eat rice, fish, etc. and drink tea."])
        self.assertEqual(pl.split_sentences("We eat rice, fish, etc. Then we sleep."), ["We eat rice, fish, etc.", "Then we sleep."])

    def test_long_sentence_is_split_at_commas_into_chunks_of_six_words(self):
        long = "When the morning sun finally rose over the quiet hills, the farmers walked slowly to the fields, and the children ran to school."
        parts = pl.split_sentences(long)
        self.assertGreater(len(parts), 1)
        for p in parts:
            self.assertGreaterEqual(len(p.split(" ")), 6)
        self.assertEqual(" ".join(parts), long)

    def test_long_sentence_without_commas_stays_whole(self):
        long = "one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen."
        self.assertEqual(pl.split_sentences(long), [long])

    def test_the_placeholder_character_never_leaks(self):
        out = pl.split_sentences("Mr. Lee lives in the U.S. now. " + pl.PROTECTED_DOT + " odd. It costs 5.5 dollars.")
        self.assertNotIn(pl.PROTECTED_DOT, " ".join(out))


class RoundingTests(unittest.TestCase):
    def test_round2_rounds_half_up_like_javascript(self):
        # Expected values were produced by Math.round(n * 100) / 100 in Node.
        for value, expected in [(0.125, 0.13), (2.675, 2.68), (0.075, 0.08), (1.005, 1.0), (0.285, 0.28),
                                (1.255, 1.25), (8.345, 8.35), (2.5, 2.5), (0, 0), (29.545556, 29.55)]:
            with self.subTest(value=value):
                self.assertEqual(pl.round2(value), expected)

    def test_round2_differs_from_the_builtin_where_it_matters(self):
        # round() rounds half to even; JavaScript rounds half up. These are why round2 exists.
        for value in (0.125, 2.675, 0.075):
            self.assertNotEqual(pl.round2(value), round(value, 2))


class AlignSentencesParityTests(unittest.TestCase):
    def test_matches_the_typescript_implementation_on_every_vector(self):
        for i, case in enumerate(VECTORS["align"]):
            with self.subTest(case=i, sentences=len(case["texts"]), duration=case["duration"]):
                got = pl.align_sentences(case["texts"], case["duration"], case["silences"])
                self.assertEqual(len(got), len(case["out"]))
                for g, want in zip(got, case["out"]):
                    self.assertEqual(g["text"], want["text"])
                    self.assertAlmostEqual(g["start"], want["start"], places=9)
                    self.assertAlmostEqual(g["end"], want["end"], places=9)

    def test_boundaries_increase_and_stay_inside_the_file(self):
        texts = ["First sentence here.", "Second one.", "A third, rather longer sentence.", "End."]
        for silences in ([], [3.1, 6, 12.5, 15]):
            out = pl.align_sentences(texts, 20, silences)
            starts = [s["start"] for s in out]
            self.assertEqual(starts, sorted(set(starts)))
            self.assertEqual(out[0]["start"], 0)
            self.assertEqual(out[-1]["end"], 20)
            for s in out:
                self.assertGreaterEqual(s["start"], 0)
                self.assertLessEqual(s["end"], 20)
                self.assertGreater(s["end"], s["start"])

    def test_snaps_to_a_nearby_silence(self):
        texts = ["First sentence here.", "Second one.", "A third, rather longer sentence.", "End."]
        plain = pl.align_sentences(texts, 20, [])
        snapped = pl.align_sentences(texts, 20, [plain[1]["start"] + 0.7])
        self.assertAlmostEqual(snapped[1]["start"], plain[1]["start"] + 0.7, places=1)

    def test_ignores_silences_farther_than_two_seconds(self):
        texts = ["Aaaa aaaa.", "Bbbb bbbb.", "Cccc cccc."]
        plain = pl.align_sentences(texts, 30, [])
        far = pl.align_sentences(texts, 30, [plain[1]["start"] + 2.5])
        self.assertEqual(far, plain)

    def test_synthetic_silence_list_gives_the_expected_boundaries(self):
        texts = ["One two three.", "Four five six seven.", "Eight nine.", "Ten."]
        silences = [4.9, 10.2, 13.1]
        out = pl.align_sentences(texts, 16.0, silences)
        # proportional guesses are 4.2, 9.7 and 14.9: each snaps to the nearest silence within 2 s
        self.assertEqual([s["start"] for s in out], [0, 4.9, 10.2, 13.1])
        self.assertEqual([s["end"] for s in out], [5.05, 10.35, 13.25, 16.0])

    def test_gives_every_sentence_at_least_the_minimum_gap_on_a_short_file(self):
        many = [f"Sentence number {i}." for i in range(8)]
        out = pl.align_sentences(many, 3.6, [0.1, 0.2, 3.5])
        for k, s in enumerate(out):
            nxt = out[k + 1]["start"] if k + 1 < len(out) else 3.6
            self.assertGreaterEqual(nxt - s["start"], pl.MIN_GAP - 0.011)

    def test_splits_evenly_when_shorter_than_n_times_the_minimum_gap(self):
        out = pl.align_sentences([f"Sentence {i}." for i in range(10)], 2, [])
        self.assertAlmostEqual(out[1]["start"], 0.2, places=2)

    def test_single_sentence_and_no_sentences(self):
        out = pl.align_sentences(["Only one."], 5, [])
        self.assertEqual((out[0]["start"], out[0]["end"]), (0, 5))
        self.assertEqual(pl.align_sentences([], 5, []), [])

    def test_times_are_rounded_to_two_decimals(self):
        for s in pl.align_sentences(["Aaa bbb.", "Ccc ddd eee.", "Fff."], 7.777, [1.234, 5.678]):
            self.assertEqual(s["start"], round(s["start"], 2))
            self.assertEqual(s["end"], round(s["end"], 2))


class SilenceParityTests(unittest.TestCase):
    def test_matches_the_typescript_implementation_on_every_signal(self):
        for i, case in enumerate(VECTORS["silences"]):
            with self.subTest(signal=i, rate=case["sr"]):
                got = pl.find_silences(signal(case["sr"], case["segments"]), case["sr"])
                self.assertEqual(len(got), len(case["out"]))
                for g, want in zip(got, case["out"]):
                    self.assertAlmostEqual(g, want, places=9)

    def test_constants_match_segment_ts(self):
        src = (ROOT / "src" / "lib" / "segment.ts").read_text(encoding="utf-8")
        for name, value in {
            "FRAME_SEC": pl.FRAME_SEC,
            "MIN_SILENCE_FRAMES": pl.MIN_SILENCE_FRAMES,
            "MIN_GAP": pl.MIN_GAP,
            "TAIL_PAD": pl.TAIL_PAD,
            "MAX_WORDS": pl.MAX_WORDS,
            "MIN_CHUNK_WORDS": pl.MIN_CHUNK_WORDS,
        }.items():
            self.assertRegex(src, rf"const {name} = {value}\b", name)

    def test_empty_or_tiny_input(self):
        self.assertEqual(pl.find_silences(array.array("f"), 16000), [])
        self.assertEqual(pl.frame_rms(array.array("f", [0.1] * 10), 16000), [])  # shorter than one frame

    def test_edge_silence(self):
        rate = 1000
        data = signal(rate, [[0.8, 0.0], [1.0, 0.3], [0.6, 0.0]])
        lead, trail = pl.edge_silence(pl.frame_rms(data, rate))
        self.assertAlmostEqual(lead, 0.8, places=1)
        self.assertAlmostEqual(trail, 0.6, places=1)
        self.assertEqual(pl.edge_silence([]), (0.0, 0.0))

    def test_edge_silence_of_a_file_that_is_all_silence(self):
        lead, trail = pl.edge_silence([0.0] * 20)
        self.assertEqual(lead + trail, 1.0)  # 20 frames of 50 ms, never counted twice


# ------------------------------------------------------------------------------ header and metadata
class HeaderTests(unittest.TestCase):
    def test_parses_a_header_and_the_transcript(self):
        raw = "title: Lesson 2: At home\nurl: https://example.com/a\ntopic: Daily life\nlevel: A1\norder: 2\n---\nHello.\nBye."
        header, transcript, warnings = pl.parse_lesson_text(raw)
        self.assertEqual(
            header,
            {"title": "Lesson 2: At home", "url": "https://example.com/a", "topic": "Daily life", "level": "A1", "order": "2"},
        )
        self.assertEqual(transcript, "Hello.\nBye.")
        self.assertEqual(warnings, [])

    def test_no_separator_means_the_whole_file_is_the_transcript(self):
        header, transcript, _ = pl.parse_lesson_text("Hello there.\nHow are you?")
        self.assertEqual(header, {})
        self.assertEqual(transcript, "Hello there.\nHow are you?")

    def test_keys_are_case_insensitive_and_blank_lines_are_fine(self):
        header, transcript, _ = pl.parse_lesson_text("\n  Title :  X  \n\nLEVEL: a2\n---\nText.")
        self.assertEqual(header, {"title": "X", "level": "a2"})
        self.assertEqual(transcript, "Text.")

    def test_utf8_bom_and_windows_newlines(self):
        header, transcript, _ = pl.parse_lesson_text("﻿title: X\r\n---\r\nHello.\r\n")
        self.assertEqual(header, {"title": "X"})
        self.assertIn("Hello.", transcript)

    def test_unknown_keys_give_a_warning(self):
        header, _, warnings = pl.parse_lesson_text("author: Someone\ntitle: X\n---\nText.")
        self.assertEqual(header, {"title": "X"})
        self.assertEqual(len(warnings), 1)
        self.assertIn("author", warnings[0])

    def test_a_header_line_without_a_colon_is_an_error(self):
        with self.assertRaises(pl.LessonError) as cm:
            pl.parse_lesson_text("title Lesson 2\n---\nText.")
        self.assertIn("title Lesson 2", str(cm.exception))

    def test_only_the_first_separator_splits(self):
        _, transcript, _ = pl.parse_lesson_text("title: X\n---\nOne.\n---\nTwo.")
        self.assertEqual(transcript, "One.\n---\nTwo.")


class MetaTests(unittest.TestCase):
    LEVELS = ("A1", "A2")

    def test_defaults(self):
        meta, warnings = pl.resolve_meta("voa-l02", {}, self.LEVELS)
        self.assertEqual((meta.title, meta.level, meta.topic, meta.order), ("voa-l02", "A1", "Daily English", None))
        self.assertEqual(meta.url, "https://learningenglish.voanews.com/")
        self.assertTrue(meta.url_is_default)
        self.assertEqual(len(warnings), 1)
        self.assertIn("CẢNH BÁO", warnings[0])

    def test_given_values_and_no_warning_when_the_url_is_given(self):
        header = {"title": "Lesson 2", "url": "https://example.com/a", "topic": "Home", "level": "a2", "order": "2"}
        meta, warnings = pl.resolve_meta("x", header, self.LEVELS)
        self.assertEqual((meta.title, meta.url, meta.topic, meta.level, meta.order), ("Lesson 2", "https://example.com/a", "Home", "A2", 2))
        self.assertEqual(warnings, [])

    def test_invalid_level_order_and_url(self):
        for header in ({"level": "C1"}, {"order": "0"}, {"order": "1.5"}, {"order": "abc"}, {"order": "-2"}, {"url": "ftp://x"}, {"url": "javascript:alert(1)"}):
            with self.subTest(header=header), self.assertRaises(pl.LessonError):
                pl.resolve_meta("x", header, self.LEVELS)

    def test_levels_come_from_types_ts(self):
        self.assertEqual(pl.load_levels(ROOT), ("A1", "A2"))

    def test_levels_fall_back_when_types_ts_is_missing(self):
        with tempfile.TemporaryDirectory() as tmp:
            self.assertEqual(pl.load_levels(Path(tmp)), pl.DEFAULT_LEVELS)

    def test_levels_follow_the_file(self):
        with tempfile.TemporaryDirectory() as tmp:
            d = Path(tmp) / "src" / "lib"
            d.mkdir(parents=True)
            (d / "types.ts").write_text("export const LEVELS: readonly Level[] = ['A1', 'A2', 'B1']\n", encoding="utf-8")
            self.assertEqual(pl.load_levels(Path(tmp)), ("A1", "A2", "B1"))


class IdTests(unittest.TestCase):
    def test_valid_ids(self):
        for good in ("voa-l02", "test1", "a", "2024-lesson-9", "a-b-c"):
            with self.subTest(id=good):
                pl.check_id(good)

    def test_invalid_ids_are_rejected_with_a_suggestion(self):
        for bad in ("Voa-L02", "voa_l02", "voa l02", "voa-102-HiIamAnna", "bài-1", "", "-", "a/b", "a.b"):
            with self.subTest(id=bad), self.assertRaises(pl.LessonError):
                pl.check_id(bad)
        with self.assertRaises(pl.LessonError) as cm:
            pl.check_id("voa-102-HiIamAnna")
        self.assertIn("voa-102-hiiamanna", str(cm.exception))


# ------------------------------------------------------------------------------ lesson building / validation
class BuildLessonTests(unittest.TestCase):
    def test_key_order_matches_the_existing_lesson_in_index_json(self):
        existing = json.loads((ROOT / "public" / "lessons" / "index.json").read_text(encoding="utf-8"))["lessons"][0]
        expected = [k for k in existing if k not in ("seriesId", "order")]
        self.assertEqual(list(good_lesson().keys()), expected)
        self.assertEqual(list(good_lesson()["sentences"][0].keys()), list(existing["sentences"][0].keys()))
        self.assertEqual(list(good_lesson()["source"].keys()), list(existing["source"].keys()))

    def test_order_comes_last_and_only_when_given(self):
        self.assertNotIn("order", good_lesson())
        meta = pl.Meta("T", "https://example.com", "x", "A1", 3, False)
        lesson = pl.build_lesson("x", meta, 5.0, [{"text": "A.", "start": 0, "end": 5}], 1)
        self.assertEqual(list(lesson.keys())[-1], "order")
        self.assertEqual(lesson["order"], 3)

    def test_fields(self):
        lesson = good_lesson()
        self.assertEqual(lesson["kind"], "static")
        self.assertEqual(lesson["langId"], "en")
        self.assertEqual(lesson["audioUrl"], "lessons/voa/test-l01.mp3")
        self.assertEqual(lesson["createdAt"], 1700000000000)
        self.assertEqual([s["id"] for s in lesson["sentences"]], ["test-l01-1", "test-l01-2"])
        self.assertEqual(lesson["source"], {"name": "Voice of America", "url": "https://example.com/x", "license": "public domain"})

    def test_a_good_lesson_is_valid_and_json_serialisable(self):
        self.assertEqual(pl.validate_lesson(good_lesson()), [])
        json.dumps(good_lesson())


class ValidateLessonTests(unittest.TestCase):
    def errors(self, **over) -> list[str]:
        return pl.validate_lesson(good_lesson(**over))

    def with_sentence(self, **over) -> list[str]:
        lesson = good_lesson()
        lesson["sentences"][1].update(over)
        return pl.validate_lesson(lesson)

    def test_required_text_fields(self):
        for key in ("id", "title", "audioUrl", "topic"):
            for bad in ("", "   ", None, 5):
                with self.subTest(field=key, value=bad):
                    self.assertTrue(self.errors(**{key: bad}), key)

    def test_kind_must_be_static(self):
        self.assertTrue(self.errors(kind="media"))

    def test_level_must_be_known(self):
        self.assertTrue(self.errors(level="C1"))
        self.assertEqual(pl.validate_lesson(good_lesson(level="B1"), ("A1", "B1")), [])

    def test_duration_must_be_a_positive_finite_number(self):
        for bad in (0, -1, float("nan"), float("inf"), "10", None, True):
            with self.subTest(duration=bad):
                self.assertTrue(pl.validate_lesson(good_lesson(duration=bad)))

    def test_source_needs_name_url_and_license(self):
        for bad in ({"name": "a", "url": "https://x"}, {"name": "", "url": "https://x", "license": "l"}, "VOA", None):
            with self.subTest(source=bad):
                self.assertTrue(self.errors(source=bad))

    def test_order_must_be_a_positive_integer(self):
        for bad in (0, -1, 1.5, "2", True):
            with self.subTest(order=bad):
                self.assertTrue(self.errors(order=bad))
        self.assertEqual(self.errors(order=2), [])

    def test_sentences_must_not_be_empty(self):
        for bad in ([], None, "text"):
            with self.subTest(sentences=bad):
                self.assertTrue(self.errors(sentences=bad))

    def test_sentence_times(self):
        self.assertTrue(self.with_sentence(start=5.0, end=5.0))  # start == end
        self.assertTrue(self.with_sentence(start=6.0, end=5.0))  # end before start
        self.assertTrue(self.with_sentence(start=-0.1))  # negative start
        self.assertTrue(self.with_sentence(end=10.02))  # beyond duration + 0.01
        self.assertEqual(self.with_sentence(end=10.01), [])  # within the tolerance
        self.assertTrue(self.with_sentence(start="4", end=9))  # not numbers
        self.assertTrue(self.with_sentence(start=float("nan")))

    def test_sentence_text_must_not_be_blank(self):
        self.assertTrue(self.with_sentence(text="  "))
        self.assertTrue(self.with_sentence(text=None))

    def test_sentence_ids_must_be_unique_and_present(self):
        self.assertTrue(self.with_sentence(id="test-l01-1"))
        self.assertTrue(self.with_sentence(id=""))

    def test_messages_are_in_vietnamese_and_name_the_sentence(self):
        msg = " ".join(self.with_sentence(text=""))
        self.assertIn("câu 2", msg)
        self.assertIn("chưa có chữ", msg)


class WarningsTests(unittest.TestCase):
    def sentences(self, *items):
        return [{"text": t, "start": a, "end": b} for t, a, b in items]

    def test_no_warnings_for_a_clean_lesson(self):
        s = self.sentences(("Hello there.", 0, 3), ("How are you?", 3, 6))
        self.assertEqual(pl.lesson_warnings(s, 6, 0.2, 0.3), [])

    def test_long_sentence(self):
        s = self.sentences((" ".join(["word"] * 17) + ".", 0, 8))
        out = pl.lesson_warnings(s, 8, 0, 0)
        self.assertEqual(len(out), 1)
        self.assertIn("17 từ", out[0])
        self.assertEqual(pl.lesson_warnings(self.sentences((" ".join(["w"] * 16) + ".", 0, 8)), 8, 0, 0), [])

    def test_short_sentence(self):
        out = pl.lesson_warnings(self.sentences(("Hi.", 0, 0.59), ("OK.", 0.59, 2)), 2, 0, 0)
        self.assertEqual(len(out), 1)
        self.assertIn("Câu 1", out[0])
        self.assertEqual(pl.lesson_warnings(self.sentences(("Hi.", 0, 0.6)), 0.6, 0, 0), [])

    def test_sentence_ending_with_a_comma(self):
        out = pl.lesson_warnings(self.sentences(("My new apartment,", 0, 3)), 3, 0, 0)
        self.assertEqual(len(out), 1)
        self.assertIn("dấu phẩy", out[0])

    def test_large_first_and_last_gaps(self):
        s = self.sentences(("Hello there.", 0, 5))
        out = pl.lesson_warnings(s, 5, 2.5, 3.0)
        self.assertEqual(len(out), 2)
        self.assertIn("Đầu file", out[0])
        self.assertIn("Cuối file", out[1])
        self.assertEqual(pl.lesson_warnings(s, 5, 2.0, 2.0), [])  # exactly at the limit is fine

    def test_no_silences_found_is_reported_once_there_are_several_sentences(self):
        s = self.sentences(("Hello there.", 0, 3), ("How are you?", 3, 6))
        out = pl.lesson_warnings(s, 6, 0, 0, silence_count=0)
        self.assertEqual(len(out), 1)
        self.assertIn("quãng im lặng", out[0])
        self.assertEqual(pl.lesson_warnings(s, 6, 0, 0, silence_count=3), [])
        self.assertEqual(pl.lesson_warnings(s, 6, 0, 0), [])  # unknown count: no claim
        self.assertEqual(pl.lesson_warnings(self.sentences(("Only one.", 0, 6)), 6, 0, 0, silence_count=0), [])

    def test_table_has_a_header_and_one_row_per_sentence(self):
        s = self.sentences(("Hello there.", 0, 2.28), ("Bye.", 2.28, 4))
        lines = pl.format_table(s).splitlines()
        self.assertEqual(len(lines), 3)
        self.assertIn("2.28", lines[1])
        self.assertIn("Hello there.", lines[1])

    def test_long_text_is_cut_in_the_table(self):
        s = self.sentences(("x" * 200, 0, 5))
        self.assertLess(len(pl.format_table(s, width=40).splitlines()[1]), 80)


# ------------------------------------------------------------------------------ index.json
class CatalogTests(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        self.dir = Path(self._tmp.name)
        self.path = self.dir / "index.json"
        self.catalog = {
            "version": 1,
            "lessons": [{"id": "old-1", "title": "Old"}],
            "pictures": [{"id": "met-1", "title": "Pic", "description": ["Việt Nam"]}],
        }
        self.path.write_text(pl.dump_catalog(self.catalog), encoding="utf-8")

    def test_the_real_index_json_round_trips_byte_for_byte(self):
        real = ROOT / "public" / "lessons" / "index.json"
        text = real.read_text(encoding="utf-8")
        self.assertEqual(pl.dump_catalog(json.loads(text)), text)

    def test_format_is_two_space_utf8_with_a_final_newline(self):
        text = pl.dump_catalog({"a": ["Việt"]})
        self.assertEqual(text, '{\n  "a": [\n    "Việt"\n  ]\n}\n')

    def test_new_lesson_is_appended_and_everything_else_is_untouched(self):
        lesson = good_lesson()
        new, status = pl.update_catalog(self.catalog, lesson, force=False)
        self.assertEqual(status, "added")
        self.assertEqual([x["id"] for x in new["lessons"]], ["old-1", "test-l01"])
        self.assertEqual(new["pictures"], self.catalog["pictures"])
        self.assertEqual(list(new.keys()), ["version", "lessons", "pictures"])

    def test_update_does_not_mutate_its_input(self):
        before = json.dumps(self.catalog)
        pl.update_catalog(self.catalog, good_lesson(), force=False)
        self.assertEqual(json.dumps(self.catalog), before)

    def test_an_existing_id_is_skipped_without_force(self):
        existing = {"id": "test-l01", "title": "Keep me"}
        catalog = {**self.catalog, "lessons": [existing]}
        new, status = pl.update_catalog(catalog, good_lesson(), force=False)
        self.assertEqual(status, "skipped")
        self.assertIs(new, catalog)
        self.assertEqual(new["lessons"], [existing])

    def test_force_replaces_in_place(self):
        catalog = {**self.catalog, "lessons": [{"id": "a"}, {"id": "test-l01", "title": "Old"}, {"id": "b"}]}
        new, status = pl.update_catalog(catalog, good_lesson(title="New"), force=True)
        self.assertEqual(status, "replaced")
        self.assertEqual([x["id"] for x in new["lessons"]], ["a", "test-l01", "b"])
        self.assertEqual(new["lessons"][1]["title"], "New")
        self.assertEqual(len(new["lessons"]), 3)

    def test_force_on_a_new_id_still_just_adds(self):
        self.assertEqual(pl.update_catalog(self.catalog, good_lesson(), force=True)[1], "added")

    def test_write_creates_a_backup_of_the_previous_file(self):
        old_text = self.path.read_text(encoding="utf-8")
        new, _ = pl.update_catalog(self.catalog, good_lesson(), force=False)
        pl.write_catalog(self.path, new)
        self.assertEqual(self.path.with_name("index.json.bak").read_text(encoding="utf-8"), old_text)
        self.assertEqual(json.loads(self.path.read_text(encoding="utf-8")), new)
        self.assertTrue(self.path.read_text(encoding="utf-8").endswith("\n"))

    def test_the_old_backup_is_overwritten(self):
        bak = self.path.with_name("index.json.bak")
        bak.write_text("stale", encoding="utf-8")
        pl.write_catalog(self.path, pl.update_catalog(self.catalog, good_lesson(), False)[0])
        self.assertNotEqual(bak.read_text(encoding="utf-8"), "stale")

    def test_no_temporary_files_are_left_behind(self):
        pl.write_catalog(self.path, pl.update_catalog(self.catalog, good_lesson(), False)[0])
        self.assertEqual(sorted(p.name for p in self.dir.iterdir()), ["index.json", "index.json.bak"])

    def test_a_failed_replace_keeps_the_original_and_cleans_up(self):
        original = self.path.read_text(encoding="utf-8")
        with mock.patch("process_lesson.os.replace", side_effect=OSError("disk full")):
            with self.assertRaises(OSError):
                pl.write_catalog(self.path, pl.update_catalog(self.catalog, good_lesson(), False)[0])
        self.assertEqual(self.path.read_text(encoding="utf-8"), original)
        self.assertEqual(sorted(p.name for p in self.dir.iterdir()), ["index.json", "index.json.bak"])

    def test_no_backup_when_the_file_did_not_exist(self):
        fresh = self.dir / "new" / "index.json"
        fresh.parent.mkdir()
        pl.write_catalog(fresh, self.catalog)
        self.assertEqual([p.name for p in fresh.parent.iterdir()], ["index.json"])

    def test_load_errors_are_lesson_errors(self):
        with self.assertRaises(pl.LessonError):
            pl.load_catalog(self.dir / "missing.json")
        (self.dir / "bad.json").write_text("{nope", encoding="utf-8")
        with self.assertRaises(pl.LessonError):
            pl.load_catalog(self.dir / "bad.json")
        (self.dir / "nolessons.json").write_text('{"version": 1}', encoding="utf-8")
        with self.assertRaises(pl.LessonError):
            pl.load_catalog(self.dir / "nolessons.json")

    def test_load_accepts_a_utf8_bom(self):
        (self.dir / "bom.json").write_bytes(b"\xef\xbb\xbf" + json.dumps(self.catalog).encode("utf-8"))
        self.assertEqual(pl.load_catalog(self.dir / "bom.json")["version"], 1)

    def test_a_lessons_file_without_a_pictures_key_is_read_and_written_back(self):
        only = {"version": 1, "lessons": [{"id": "old-1", "title": "Old"}]}
        self.path.write_text(pl.dump_catalog(only), encoding="utf-8")
        loaded = pl.load_catalog(self.path)
        self.assertNotIn("pictures", loaded)
        new, status = pl.update_catalog(loaded, good_lesson(), force=False)
        self.assertEqual(status, "added")
        pl.write_catalog(self.path, new)
        written = json.loads(self.path.read_text(encoding="utf-8"))
        self.assertEqual(list(written.keys()), ["version", "lessons"])  # no "pictures" key appears
        self.assertEqual([x["id"] for x in written["lessons"]], ["old-1", "test-l01"])

    def test_catalog_ids(self):
        self.assertEqual(pl.catalog_ids({"lessons": [{"id": "a"}, {"id": "b"}, "junk", {"x": 1}]}), {"a", "b"})


# ------------------------------------------------------------------------------ inbox + tools
class DiscoverTests(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        self.inbox = Path(self._tmp.name)

    def touch(self, *names):
        for n in names:
            (self.inbox / n).write_bytes(b"x")

    def test_pairs_audio_with_the_text_of_the_same_stem(self):
        self.touch("a.mp3", "a.txt", "b.m4a", "b.txt", "c.wav", "c.txt")
        items, notes = pl.discover(self.inbox)
        self.assertEqual([(i.lesson_id, i.audio.name) for i in items], [("a", "a.mp3"), ("b", "b.m4a"), ("c", "c.wav")])
        self.assertEqual(notes, [])

    def test_audio_without_a_text_is_skipped_with_a_note(self):
        self.touch("lonely.mp3", "a.mp3", "a.txt")
        items, notes = pl.discover(self.inbox)
        self.assertEqual([i.lesson_id for i in items], ["a"])
        self.assertEqual(len(notes), 1)
        self.assertIn("lonely.txt", notes[0])

    def test_text_without_audio_is_ignored(self):
        self.touch("only.txt")
        self.assertEqual(pl.discover(self.inbox)[0], [])

    def test_the_done_folder_is_not_scanned(self):
        (self.inbox / "done").mkdir()
        (self.inbox / "done" / "old.mp3").write_bytes(b"x")
        (self.inbox / "done" / "old.txt").write_bytes(b"x")
        self.assertEqual(pl.discover(self.inbox)[0], [])

    def test_other_extensions_are_ignored_and_case_does_not_matter(self):
        self.touch("a.ogg", "a.txt", "B.MP3", "B.txt")
        items, _ = pl.discover(self.inbox)
        self.assertEqual([i.lesson_id for i in items], ["B"])

    def test_two_audio_files_with_one_stem_are_ambiguous(self):
        self.touch("a.mp3", "a.wav", "a.txt")
        items, notes = pl.discover(self.inbox)
        self.assertEqual(items, [])
        self.assertIn("nhiều file audio", notes[0])

    def test_only_id(self):
        self.touch("a.mp3", "a.txt", "b.mp3", "b.txt")
        items, _ = pl.discover(self.inbox, "b")
        self.assertEqual([i.lesson_id for i in items], ["b"])
        items, notes = pl.discover(self.inbox, "zzz")
        self.assertEqual(items, [])
        self.assertIn("zzz", notes[0])

    def test_a_missing_inbox(self):
        items, notes = pl.discover(self.inbox / "nope")
        self.assertEqual(items, [])
        self.assertEqual(len(notes), 1)

    def test_move_to_done_never_overwrites(self):
        self.touch("a.mp3", "a.txt")
        item = pl.Item("a", self.inbox / "a.mp3", self.inbox / "a.txt")
        first = pl.move_to_done(item, self.inbox)
        self.assertEqual([p.name for p in first], ["a.mp3", "a.txt"])
        self.assertFalse((self.inbox / "a.mp3").exists())
        self.touch("a.mp3", "a.txt")
        pl.move_to_done(item, self.inbox)
        names = sorted(p.name for p in (self.inbox / "done").iterdir())
        self.assertEqual(len(names), 4)  # the first pair is still there
        self.assertIn("a.mp3", names)


class FindToolTests(unittest.TestCase):
    def test_which_wins(self):
        with mock.patch("process_lesson.shutil.which", return_value="C:/bin/ffmpeg.exe"):
            self.assertEqual(pl.find_tool("ffmpeg", {}), "C:/bin/ffmpeg.exe")

    def test_falls_back_to_the_winget_folder(self):
        with tempfile.TemporaryDirectory() as tmp:
            bin_dir = Path(tmp) / "Microsoft" / "WinGet" / "Packages" / "Gyan.FFmpeg_x" / "ffmpeg-9-full_build" / "bin"
            bin_dir.mkdir(parents=True)
            (bin_dir / "ffmpeg.exe").write_bytes(b"")
            with mock.patch("process_lesson.shutil.which", return_value=None):
                self.assertEqual(pl.find_tool("ffmpeg", {"LOCALAPPDATA": tmp}), str(bin_dir / "ffmpeg.exe"))
                self.assertIsNone(pl.find_tool("ffprobe", {"LOCALAPPDATA": tmp}))

    def test_not_found(self):
        with mock.patch("process_lesson.shutil.which", return_value=None):
            self.assertIsNone(pl.find_tool("ffmpeg", {}))
            self.assertIsNone(pl.find_tool("ffmpeg", {"LOCALAPPDATA": "Z:/does/not/exist"}))

    def test_the_install_hint_mentions_the_winget_command(self):
        self.assertIn("winget install --id Gyan.FFmpeg -e", pl.INSTALL_HINT)

    def test_run_reports_a_missing_ffmpeg_with_the_hint_and_exit_code_1(self):
        out: list[str] = []
        with tempfile.TemporaryDirectory() as tmp:
            ctx = pl.Context(Path(tmp), Path(tmp) / "index.json", None, None, out=out.append)
            self.assertEqual(pl.run(ctx, None), 1)
        self.assertIn("winget install --id Gyan.FFmpeg -e", "\n".join(out))


# ------------------------------------------------------------------------------ end to end (needs ffmpeg)
def write_test_wav(path: Path, parts: list[tuple[float, float]], rate: int = 16000) -> None:
    """parts: (seconds, amplitude); amplitude 0 = silence. A 220 Hz tone stands in for speech."""
    samples = array.array("h")
    i = 0
    for seconds, amp in parts:
        for _ in range(int(seconds * rate)):
            samples.append(int(32767 * amp * math.sin(2 * math.pi * 220 * i / rate)))
            i += 1
    with wave.open(str(path), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(rate)
        w.writeframes(samples.tobytes())


TRANSCRIPT = "title: Test lesson\nurl: https://example.com/lesson\ntopic: Testing\nlevel: A2\norder: 4\n---\nAnna: One two three four.\nFive six seven eight\nNine ten eleven twelve.\n"


@unittest.skipUnless(FFMPEG and FFPROBE, "ffmpeg/ffprobe không có trên máy này")
class PipelineTests(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        self.root = Path(self._tmp.name)
        (self.root / "inbox" / "lessons").mkdir(parents=True)
        (self.root / "public" / "lessons").mkdir(parents=True)
        (self.root / "src" / "lib").mkdir(parents=True)
        (self.root / "src" / "lib" / "types.ts").write_text("export const LEVELS: readonly Level[] = ['A1', 'A2']\n", encoding="utf-8")
        self.catalog_path = self.root / "public" / "lessons" / "index.json"
        self.initial = {"version": 1, "lessons": [], "pictures": [{"id": "met-1", "title": "Tranh"}]}
        self.catalog_path.write_text(pl.dump_catalog(self.initial), encoding="utf-8")
        self.messages: list[str] = []

    def ctx(self, **kw) -> pl.Context:
        return pl.Context(
            self.root, self.catalog_path, FFMPEG, FFPROBE, levels=pl.load_levels(self.root), out=self.messages.append, **kw
        )

    def put_inbox(self, lesson_id: str = "test-l01", text: str = TRANSCRIPT) -> None:
        # three 3 s tone "sentences" separated by 0.8 s of silence: boundaries should land near 3.4 and 7.2
        write_test_wav(self.root / "inbox" / "lessons" / f"{lesson_id}.wav", [(3, 0.5), (0.8, 0), (3, 0.5), (0.8, 0), (3, 0.5)])
        (self.root / "inbox" / "lessons" / f"{lesson_id}.txt").write_text(text, encoding="utf-8")

    def catalog(self) -> dict:
        return json.loads(self.catalog_path.read_text(encoding="utf-8"))

    def output(self) -> str:
        return "\n".join(self.messages)

    def test_full_run_on_a_lessons_file_without_pictures(self):
        self.catalog_path.write_text(pl.dump_catalog({"version": 1, "lessons": []}), encoding="utf-8")
        self.put_inbox()
        self.assertEqual(pl.run(self.ctx(), None), 0, self.output())
        cat = self.catalog()
        self.assertEqual(list(cat.keys()), ["version", "lessons"])
        self.assertEqual([x["id"] for x in cat["lessons"]], ["test-l01"])

    def test_full_run_adds_the_lesson(self):
        self.put_inbox()
        self.assertEqual(pl.run(self.ctx(), None), 0, self.output())
        mp3 = self.root / "public" / "lessons" / "voa" / "test-l01.mp3"
        self.assertTrue(mp3.is_file())

        cat = self.catalog()
        self.assertEqual(cat["pictures"], self.initial["pictures"])  # untouched
        (lesson,) = cat["lessons"]
        self.assertEqual(pl.validate_lesson(lesson, ("A1", "A2")), [])
        self.assertEqual((lesson["id"], lesson["title"], lesson["level"], lesson["topic"], lesson["order"]), ("test-l01", "Test lesson", "A2", "Testing", 4))
        self.assertEqual(lesson["audioUrl"], "lessons/voa/test-l01.mp3")
        self.assertEqual(lesson["source"], {"name": "Voice of America", "url": "https://example.com/lesson", "license": "public domain"})
        self.assertEqual([s["text"] for s in lesson["sentences"]], ["One two three four.", "Five six seven eight.", "Nine ten eleven twelve."])
        self.assertAlmostEqual(lesson["duration"], 10.6, delta=0.3)  # 3 + 0.8 + 3 + 0.8 + 3 s
        self.assertEqual(lesson["sentences"][0]["start"], 0)
        # boundaries snap to the real silences (3.0-3.8 s and 6.8-7.6 s of the 3+0.8+3+0.8+3 s file)
        self.assertAlmostEqual(lesson["sentences"][1]["start"], 3.4, delta=0.4)
        self.assertAlmostEqual(lesson["sentences"][2]["start"], 7.2, delta=0.4)
        self.assertEqual(pl.dump_catalog(cat), self.catalog_path.read_text(encoding="utf-8"))

    def test_the_converted_audio_is_mono_48_kbps_mp3_without_metadata(self):
        self.put_inbox()
        pl.run(self.ctx(), None)
        mp3 = self.root / "public" / "lessons" / "voa" / "test-l01.mp3"
        import subprocess

        info = json.loads(
            subprocess.run(
                [FFPROBE, "-v", "error", "-show_entries", "stream=codec_name,channels,bit_rate:format=tags", "-of", "json", str(mp3)],
                capture_output=True,
                check=True,
            ).stdout
        )
        stream = info["streams"][0]
        self.assertEqual((stream["codec_name"], stream["channels"]), ("mp3", 1))
        self.assertAlmostEqual(int(stream["bit_rate"]), 48000, delta=6000)
        self.assertEqual({k.lower() for k in info.get("format", {}).get("tags", {})} - {"encoder"}, set())

    def test_inbox_files_move_to_done_and_a_backup_is_kept(self):
        self.put_inbox()
        pl.run(self.ctx(), None)
        inbox = self.root / "inbox" / "lessons"
        self.assertEqual(sorted(p.name for p in inbox.iterdir()), ["done"])
        self.assertEqual(sorted(p.name for p in (inbox / "done").iterdir()), ["test-l01.txt", "test-l01.wav"])
        self.assertEqual(json.loads(self.catalog_path.with_name("index.json.bak").read_text(encoding="utf-8")), self.initial)

    def test_keep_inbox_leaves_the_files(self):
        self.put_inbox()
        self.assertEqual(pl.run(self.ctx(keep_inbox=True), None), 0)
        self.assertEqual(sorted(p.name for p in (self.root / "inbox" / "lessons").iterdir()), ["test-l01.txt", "test-l01.wav"])

    def test_dry_run_writes_and_moves_nothing_but_shows_the_table(self):
        self.put_inbox()
        before = self.catalog_path.read_text(encoding="utf-8")
        self.assertEqual(pl.run(self.ctx(dry_run=True), None), 0, self.output())
        self.assertEqual(self.catalog_path.read_text(encoding="utf-8"), before)
        self.assertFalse((self.root / "public" / "lessons" / "voa").exists())
        self.assertFalse(self.catalog_path.with_name("index.json.bak").exists())
        self.assertEqual(sorted(p.name for p in (self.root / "inbox" / "lessons").iterdir()), ["test-l01.txt", "test-l01.wav"])
        out = self.output()
        self.assertIn("CHẠY THỬ", out)
        self.assertIn("One two three four.", out)
        self.assertIn("Chạy lại không có --dry-run", out)

    def test_an_existing_lesson_is_skipped_then_replaced_with_force(self):
        self.put_inbox()
        pl.run(self.ctx(keep_inbox=True), None)
        first = self.catalog()["lessons"][0]

        self.messages.clear()
        self.assertEqual(pl.run(self.ctx(keep_inbox=True), None), 0)
        self.assertIn("bỏ qua", self.output())
        self.assertEqual(self.catalog()["lessons"], [first])

        self.messages.clear()
        (self.root / "inbox" / "lessons" / "test-l01.txt").write_text(TRANSCRIPT.replace("Test lesson", "Renamed"), encoding="utf-8")
        self.assertEqual(pl.run(self.ctx(keep_inbox=True, force=True), None), 0, self.output())
        lessons = self.catalog()["lessons"]
        self.assertEqual(len(lessons), 1)
        self.assertEqual(lessons[0]["title"], "Renamed")
        self.assertTrue((self.root / "public" / "lessons" / "voa" / "test-l01.mp3.bak").is_file())

    def test_an_existing_mp3_is_not_overwritten_without_force(self):
        self.put_inbox()
        voa = self.root / "public" / "lessons" / "voa"
        voa.mkdir(parents=True)
        (voa / "test-l01.mp3").write_bytes(b"precious")
        self.assertEqual(pl.run(self.ctx(), None), 1)
        self.assertEqual((voa / "test-l01.mp3").read_bytes(), b"precious")
        self.assertEqual(self.catalog(), self.initial)
        self.assertTrue((self.root / "inbox" / "lessons" / "test-l01.wav").exists())

    def test_a_bad_lesson_fails_with_exit_code_1_and_changes_nothing(self):
        self.put_inbox("Bad_Id")  # uppercase and underscore
        self.put_inbox("good-one")
        self.assertEqual(pl.run(self.ctx(), None), 1)  # one failed
        self.assertIn("Bad_Id", self.output())
        self.assertEqual([x["id"] for x in self.catalog()["lessons"]], ["good-one"])  # the other was still processed
        self.assertTrue((self.root / "inbox" / "lessons" / "Bad_Id.wav").exists())  # failed files stay in the inbox

    def test_an_empty_transcript_fails(self):
        self.put_inbox(text="title: X\n---\n  \n")
        self.assertEqual(pl.run(self.ctx(), None), 1)
        self.assertIn("Transcript trống", self.output())
        self.assertEqual(self.catalog(), self.initial)

    def test_a_bad_header_fails_before_converting_anything(self):
        self.put_inbox(text="level: C9\n---\nHello there.\n")
        self.assertEqual(pl.run(self.ctx(), None), 1)
        self.assertFalse((self.root / "public" / "lessons" / "voa").exists())

    def test_no_temporary_files_are_left_after_a_failure(self):
        self.put_inbox(text="title: X\n---\n  \n")
        pl.run(self.ctx(), None)
        voa = self.root / "public" / "lessons" / "voa"
        self.assertEqual(list(voa.glob("*.tmp.mp3")) if voa.exists() else [], [])

    def test_missing_url_prints_a_warning_but_succeeds(self):
        self.put_inbox(text="---\nOne two three four.\nFive six seven eight.\nNine ten eleven twelve.\n")
        self.assertEqual(pl.run(self.ctx(), None), 0, self.output())
        self.assertIn("CẢNH BÁO", self.output())
        lesson = self.catalog()["lessons"][0]
        self.assertEqual(lesson["source"]["url"], "https://learningenglish.voanews.com/")
        self.assertEqual((lesson["title"], lesson["level"], lesson["topic"]), ("test-l01", "A1", "Daily English"))
        self.assertNotIn("order", lesson)

    def test_the_period_note_lists_the_lines_that_got_one(self):
        self.put_inbox()
        pl.run(self.ctx(), None)
        self.assertIn("Five six seven eight.", self.output())
        self.assertIn("đã thêm dấu chấm", self.output())

    def test_next_steps_are_printed_after_a_real_run(self):
        self.put_inbox()
        pl.run(self.ctx(), None)
        self.assertIn("npm run build và npm test", self.output())

    def test_only_id_processes_just_that_lesson(self):
        self.put_inbox("one-a")
        self.put_inbox("two-b")
        self.assertEqual(pl.run(self.ctx(), "two-b"), 0, self.output())
        self.assertEqual([x["id"] for x in self.catalog()["lessons"]], ["two-b"])
        self.assertTrue((self.root / "inbox" / "lessons" / "one-a.wav").exists())

    def test_only_id_that_does_not_exist_is_an_error(self):
        self.assertEqual(pl.run(self.ctx(), "nothing-here"), 1)

    def test_nothing_to_do_is_not_an_error(self):
        self.assertEqual(pl.run(self.ctx(), None), 0)
        self.assertIn("Không có bài nào", self.output())


if __name__ == "__main__":
    unittest.main()

# ------------------------------------------------------------------------------ --audio-only and --import-json
def fake_convert(ffmpeg: str, src: Path, dst: Path) -> None:
    dst.write_bytes(b"mp3:" + src.read_bytes())


class AudioFixture(unittest.TestCase):
    """A temporary project root; ffmpeg/ffprobe are mocked, so these tests never run the real tools."""

    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        self.root = Path(self._tmp.name)
        (self.root / "inbox" / "lessons").mkdir(parents=True)
        (self.root / "public" / "lessons").mkdir(parents=True)
        self.catalog_path = self.root / "public" / "lessons" / "index.json"
        self.catalog_path.write_text(pl.dump_catalog({"version": 1, "lessons": [{"id": "old-l01", "title": "Old"}]}), encoding="utf-8")
        self.messages: list[str] = []
        for target, kwargs in (
            ("process_lesson.convert_audio", {"side_effect": fake_convert}),
            ("process_lesson.probe_duration", {"return_value": 12.5}),
        ):
            patcher = mock.patch(target, **kwargs)
            self.addCleanup(patcher.stop)
            patcher.start()

    def ctx(self, **kw) -> pl.Context:
        return pl.Context(self.root, self.catalog_path, "ffmpeg", "ffprobe", out=self.messages.append, **kw)

    def raw(self, lesson_id: str, ext: str = ".mp3", data: bytes = b"RAW") -> Path:
        p = self.root / "inbox" / "lessons" / f"{lesson_id}{ext}"
        p.write_bytes(data)
        return p

    @property
    def converted(self) -> Path:
        return self.root / "public" / "lessons" / "voa"

    def output(self) -> str:
        return "\n".join(self.messages)

    def catalog(self) -> dict:
        return json.loads(self.catalog_path.read_text(encoding="utf-8"))


class AudioOnlyTests(AudioFixture):
    def test_converts_every_audio_file_without_a_txt_and_leaves_index_json_alone(self):
        before = self.catalog_path.read_bytes()
        self.raw("voa-l90-a")
        self.raw("voa-l91-b", ".wav", b"WAVDATA")
        self.assertEqual(pl.run_audio_only(self.ctx(), None), 0, self.output())
        self.assertEqual((self.converted / "voa-l90-a.mp3").read_bytes(), b"mp3:RAW")
        self.assertEqual((self.converted / "voa-l91-b.mp3").read_bytes(), b"mp3:WAVDATA")
        self.assertEqual(self.catalog_path.read_bytes(), before)
        self.assertFalse(self.catalog_path.with_name("index.json.bak").exists())

    def test_originals_move_to_done_unless_keep_inbox(self):
        a = self.raw("voa-l90-a")
        self.assertEqual(pl.run_audio_only(self.ctx(), "voa-l90-a"), 0)
        self.assertFalse(a.exists())
        self.assertTrue((self.root / "inbox" / "lessons" / "done" / "voa-l90-a.mp3").is_file())
        b = self.raw("voa-l91-b")
        self.assertEqual(pl.run_audio_only(self.ctx(keep_inbox=True), "voa-l91-b"), 0)
        self.assertTrue(b.exists())

    def test_only_id_leaves_the_other_files_alone(self):
        self.raw("voa-l90-a")
        other = self.raw("voa-l91-b")
        self.assertEqual(pl.run_audio_only(self.ctx(), "voa-l90-a"), 0)
        self.assertTrue(other.exists())
        self.assertFalse((self.converted / "voa-l91-b.mp3").exists())

    def test_an_existing_destination_is_skipped_with_a_notice_unless_force(self):
        self.converted.mkdir(parents=True)
        (self.converted / "voa-l90-a.mp3").write_bytes(b"OLD")
        raw = self.raw("voa-l90-a")
        self.assertEqual(pl.run_audio_only(self.ctx(), "voa-l90-a"), 0)
        self.assertIn("bỏ qua", self.output())
        self.assertEqual((self.converted / "voa-l90-a.mp3").read_bytes(), b"OLD")
        self.assertTrue(raw.exists())
        self.assertEqual(pl.run_audio_only(self.ctx(force=True), "voa-l90-a"), 0)
        self.assertEqual((self.converted / "voa-l90-a.mp3").read_bytes(), b"mp3:RAW")
        self.assertEqual((self.converted / "voa-l90-a.mp3.bak").read_bytes(), b"OLD")

    def test_dry_run_writes_and_moves_nothing(self):
        raw = self.raw("voa-l90-a")
        self.assertEqual(pl.run_audio_only(self.ctx(dry_run=True), None), 0)
        self.assertFalse(self.converted.exists())
        self.assertTrue(raw.exists())
        self.assertIn("CHẠY THỬ", self.output())
        self.assertIn("12.50 giây", self.output())

    def test_prints_duration_and_sizes(self):
        self.raw("voa-l90-a", data=b"x" * 2048)
        pl.run_audio_only(self.ctx(), "voa-l90-a")
        self.assertRegex(self.output(), r"12\.50 giây; dung lượng 2\.0 KB -> ")

    def test_invalid_id_is_an_error(self):
        self.raw("Bad Name")
        self.assertEqual(pl.run_audio_only(self.ctx(), None), 1)
        self.assertIn("LỖI", self.output())
        self.assertFalse(self.converted.exists())

    def test_unknown_id_and_missing_tools_exit_with_1_but_an_empty_inbox_does_not(self):
        self.assertEqual(pl.run_audio_only(self.ctx(), "voa-l99-none"), 1)
        self.assertEqual(pl.run_audio_only(self.ctx(), None), 0)
        self.assertEqual(pl.run_audio_only(pl.Context(self.root, self.catalog_path, None, None, out=self.messages.append), None), 1)

    def test_a_conversion_error_is_reported_and_the_exit_code_is_non_zero(self):
        self.raw("voa-l90-a")
        with mock.patch("process_lesson.convert_audio", side_effect=pl.LessonError("ffmpeg báo lỗi: x")):
            self.assertEqual(pl.run_audio_only(self.ctx(), None), 1)
        self.assertFalse((self.converted / "voa-l90-a.mp3").exists())

    def test_two_files_with_the_same_name_are_refused(self):
        self.raw("voa-l90-a", ".mp3")
        self.raw("voa-l90-a", ".wav")
        self.assertEqual(pl.run_audio_only(self.ctx(), "voa-l90-a"), 1)

    def test_main_wires_the_flag(self):
        self.raw("voa-l90-a")
        with mock.patch("process_lesson.find_tool", side_effect=lambda name, *a: name):
            code = pl.main(["--root", str(self.root), "--audio-only", "--id", "voa-l90-a"])
        self.assertEqual(code, 0)
        self.assertTrue((self.converted / "voa-l90-a.mp3").is_file())


def exported(lesson_id: str = "voa-l90-a", **over) -> dict:
    """What the Review screen's "Xuất bài (JSON)" produces (test data only)."""
    lesson = good_lesson(id=lesson_id, audioUrl=f"lessons/voa/{lesson_id}.mp3")
    lesson.update(over)
    return lesson


class ImportJsonTests(AudioFixture):
    def run_import(self, source, stdin=None, **kw):
        import contextlib
        import io

        buf = io.StringIO()
        with contextlib.redirect_stdout(buf):
            code = pl.run_import(self.ctx(**kw), source, (lambda: stdin) if stdin is not None else None)
        lines = buf.getvalue().strip().splitlines()
        return code, json.loads(lines[-1]), lines

    def write_json(self, lesson: dict, name: str = "lesson.json") -> str:
        p = self.root / name
        p.write_text(json.dumps(lesson, ensure_ascii=False), encoding="utf-8")
        return str(p)

    def test_valid_import_converts_adds_and_moves_the_raw_file(self):
        raw = self.raw("voa-l90-a")
        code, result, lines = self.run_import(self.write_json(exported()))
        self.assertEqual(code, 0, self.output())
        self.assertEqual(result, {"ok": True, "id": "voa-l90-a", "action": "added", "audio": "lessons/voa/voa-l90-a.mp3"})
        self.assertEqual(len(lines), 1)  # only the JSON line goes to stdout; logs went to ctx.out
        self.assertEqual((self.converted / "voa-l90-a.mp3").read_bytes(), b"mp3:RAW")
        cat = self.catalog()
        self.assertEqual([x["id"] for x in cat["lessons"]], ["old-l01", "voa-l90-a"])
        self.assertEqual(cat["lessons"][1], exported())
        self.assertTrue(self.catalog_path.with_name("index.json.bak").exists())
        self.assertFalse(raw.exists())
        self.assertTrue((self.root / "inbox" / "lessons" / "done" / "voa-l90-a.mp3").is_file())

    def test_keep_inbox_leaves_the_raw_file(self):
        raw = self.raw("voa-l90-a")
        code, _, _ = self.run_import(self.write_json(exported()), keep_inbox=True)
        self.assertEqual(code, 0)
        self.assertTrue(raw.exists())

    def test_an_invalid_lesson_is_rejected_in_vietnamese_and_nothing_is_written(self):
        self.raw("voa-l90-a")
        before = self.catalog_path.read_bytes()
        code, result, _ = self.run_import(self.write_json(exported(level="C2", topic="")))
        self.assertEqual(code, 1)
        self.assertFalse(result["ok"])
        self.assertIn("Bài không hợp lệ", result["error"])
        self.assertIn("level", result["error"])
        self.assertIn("topic", result["error"])
        self.assertEqual(self.catalog_path.read_bytes(), before)
        self.assertFalse(self.converted.exists())

    def test_an_audio_url_that_does_not_match_the_id_is_rejected(self):
        self.raw("voa-l90-a")
        code, result, _ = self.run_import(self.write_json(exported(audioUrl="lessons/voa/other.mp3")))
        self.assertEqual(code, 1)
        self.assertIn("audioUrl", result["error"])

    def test_missing_audio_gives_the_instruction(self):
        code, result, _ = self.run_import(self.write_json(exported()))
        self.assertEqual(code, 1)
        self.assertEqual(
            result["error"],
            "Không tìm thấy file audio. Đặt file gốc vào inbox/lessons/voa-l90-a.mp3 (tên file = mã bài) rồi thử lại.",
        )
        self.assertEqual([x["id"] for x in self.catalog()["lessons"]], ["old-l01"])

    def test_an_already_converted_file_is_reused_when_there_is_no_raw_file(self):
        self.converted.mkdir(parents=True)
        (self.converted / "voa-l90-a.mp3").write_bytes(b"CONVERTED")
        code, result, _ = self.run_import(self.write_json(exported()))
        self.assertEqual(code, 0, self.output())
        self.assertEqual(result["action"], "added")
        self.assertEqual((self.converted / "voa-l90-a.mp3").read_bytes(), b"CONVERTED")

    def test_an_existing_id_is_reported_unless_force(self):
        self.raw("voa-l90-a")
        self.run_import(self.write_json(exported()))
        code, result, _ = self.run_import(self.write_json(exported(title="Changed")))
        self.assertEqual(code, 1)
        self.assertFalse(result["ok"])
        self.assertTrue(result["exists"])
        self.assertIn("đã có", result["error"])
        self.assertEqual(self.catalog()["lessons"][1]["title"], "Test")

    def test_force_replaces_in_place(self):
        self.raw("voa-l90-a")
        self.run_import(self.write_json(exported()))
        code, result, _ = self.run_import(self.write_json(exported(title="Changed")), force=True)
        self.assertEqual(code, 0, self.output())
        self.assertEqual(result["action"], "replaced")
        lessons = self.catalog()["lessons"]
        self.assertEqual([x["id"] for x in lessons], ["old-l01", "voa-l90-a"])
        self.assertEqual(lessons[1]["title"], "Changed")

    def test_reads_the_lesson_from_stdin(self):
        self.raw("voa-l90-a")
        data = json.dumps(exported(title="Tiêu đề tiếng Việt"), ensure_ascii=False).encode("utf-8")
        code, result, _ = self.run_import("-", stdin=data)
        self.assertEqual(code, 0, self.output())
        self.assertEqual(self.catalog()["lessons"][1]["title"], "Tiêu đề tiếng Việt")
        self.assertTrue(result["ok"])

    def test_bad_input_always_ends_with_one_json_line(self):
        for data in (b"not json", b"[1, 2]", b"\xff\xfe", b'"text"'):
            code, result, lines = self.run_import("-", stdin=data)
            self.assertEqual(code, 1)
            self.assertFalse(result["ok"])
            self.assertEqual(len(lines), 1)
        code, result, _ = self.run_import(str(self.root / "missing.json"))
        self.assertEqual((code, result["ok"]), (1, False))

    def test_dry_run_changes_nothing(self):
        raw = self.raw("voa-l90-a")
        before = self.catalog_path.read_bytes()
        code, result, _ = self.run_import(self.write_json(exported()), dry_run=True)
        self.assertEqual((code, result["action"]), (0, "dry"))
        self.assertEqual(self.catalog_path.read_bytes(), before)
        self.assertTrue(raw.exists())
        self.assertFalse(self.converted.exists())

    def test_the_two_modes_cannot_be_combined(self):
        with self.assertRaises(SystemExit):
            pl.main(["--root", str(self.root), "--audio-only", "--import-json", "-"])
