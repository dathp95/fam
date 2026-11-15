#!/usr/bin/env python3
"""Nạp bài học có sẵn: file audio + file văn bản -> bài trong public/lessons/index.json.

Chỉ dùng thư viện chuẩn của Python 3.10+; ffmpeg/ffprobe được gọi qua subprocess.

Cấu trúc thư mục (tính từ thư mục chứa script này):

    inbox/lessons/<id>.mp3 (hoặc .m4a, .wav)   audio gốc
    inbox/lessons/<id>.txt                      transcript (có thể có phần đầu, xem bên dưới)
    public/lessons/voa/<id>.mp3                 audio đã chuyển (mono, 48 kbps), do script tạo
    public/lessons/index.json                   danh mục bài, script thêm bài vào đây

Phần đầu (tùy chọn) của file .txt, kết thúc bằng một dòng chỉ có ---:

    title: Lesson 2: At home
    url: https://learningenglish.voanews.com/a/...
    level: A1
    order: 2
    ---
    (transcript bắt đầu từ đây)

Ví dụ:  python process_lesson.py --id voa-l02-at-home --dry-run

Các chế độ khác:

    --audio-only        chỉ chuyển audio trong inbox/lessons sang public/lessons/voa/<id>.mp3
                        (không cần .txt, không đụng index.json)
    --import-json FILE  nhận MỘT bài đã xuất từ màn Review ("-" = đọc stdin), chuyển audio gốc
                        inbox/lessons/<id>.mp3 nếu có, rồi thêm bài vào index.json. Nhật ký in ra
                        stderr; dòng cuối của stdout là một dòng JSON {"ok": ...} cho chương trình gọi.
    --delete-lesson ID  bỏ bài có mã ID khỏi index.json (sao lưu .bak). File mp3 không bị xóa hẳn:
                        được chuyển vào inbox/lessons/done/. Cùng kiểu kết quả JSON ở dòng cuối stdout.

Phần tách câu, tìm quãng im lặng và căn thời điểm là bản port từ src/lib/segment.ts
(cùng hằng số, cùng kết quả), và kiểm tra bài theo đúng luật của parseStaticLesson
trong src/lib/catalog.ts.
"""

from __future__ import annotations

import argparse
import array
import json
import math
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

# --------------------------------------------------------------------------------------------
# Hằng số: lấy nguyên từ src/lib/segment.ts
# --------------------------------------------------------------------------------------------
FRAME_SEC = 0.05
MIN_SILENCE_FRAMES = 6  # 0.3 s
MIN_GAP = 0.4
TAIL_PAD = 0.15
MAX_WORDS = 16
MIN_CHUNK_WORDS = 6
SILENCE_FLOOR = 0.004
SILENCE_MEAN_FACTOR = 0.25
SNAP_RADIUS = 2.0  # giây: mốc câu chỉ "hít" vào quãng im lặng trong phạm vi này

SAMPLE_RATE = 16000  # tần số lấy mẫu khi giải mã để phân tích
AUDIO_EXTS = (".mp3", ".m4a", ".wav")
DEFAULT_LEVELS = ("A1", "A2")  # dự phòng nếu không đọc được LEVELS từ src/lib/types.ts
HEADER_KEYS = ("title", "url", "level", "order")
IGNORED_HEADER_KEYS = ("topic",)  # khóa cũ: vẫn đọc được file .txt cũ nhưng bỏ qua

DEFAULT_LEVEL = "A1"
DEFAULT_SOURCE_NAME = "Voice of America"
DEFAULT_LICENSE = "public domain"
DEFAULT_URL = "https://learningenglish.voanews.com/"

# Ngưỡng cảnh báo khi in bảng kết quả
LONG_SENTENCE_WORDS = 16
SHORT_SENTENCE_SEC = 0.6
EDGE_SILENCE_SEC = 2.0
MAX_UPLOAD_SEC = 600  # app giới hạn file tải lên 10 phút

ID_RE = re.compile(r"^[a-z0-9-]+$")


class LessonError(Exception):
    """Lỗi của một bài: bài đó bị bỏ qua, các bài khác vẫn được xử lý."""


# --------------------------------------------------------------------------------------------
# Port của src/lib/segment.ts
# --------------------------------------------------------------------------------------------
PROTECTED_DOT = ""

# Trong JS, \b và \d chỉ tính ký tự ASCII; viết tường minh để Python cho kết quả giống hệt.
_DECIMAL_RE = re.compile(r"(?<=[0-9])\.(?=[0-9])")
_TITLES_RE = re.compile(r"(?<![A-Za-z0-9_])(?:Mr|Mrs|Ms|Dr|St|Jr|Sr|vs)\.")
_ETC_RE = re.compile(r"(?<![A-Za-z0-9_])etc\.(?=\s+[a-z])")
_DOTTED_RE = re.compile(r"(?<![A-Za-z])(?:[A-Za-z]\.){2,}")
_ALWAYS_MID_RE = re.compile(r"(?:e\.g|i\.e)\.", re.IGNORECASE)
# Sau dấu chấm cuối: ngoặc/nháy đóng, rồi khoảng trắng + chữ hoa (hoặc hết văn bản).
_BREAK_AFTER_RE = re.compile(r"[\"')\]]*(?:\s+[\"'(\[]?[A-Z]|\s*\Z)")
_SENTENCE_RE = re.compile(r"[^.!?]+[.!?]+[\"')\]]*|[^.!?]+\Z")
_COMMA_SPLIT_RE = re.compile(r"(?<=[,;:])\s+")


def _word_count(s: str) -> int:
    # JS: s.split(' ').length (không phải split() nhiều khoảng trắng)
    return len(s.split(" "))


def round2(n: float) -> float:
    """Math.round(n * 100) / 100 của JS: làm tròn nửa lên (round() của Python làm tròn về số chẵn)."""
    return math.floor(n * 100 + 0.5) / 100


def protect_abbreviations(text: str) -> str:
    """Thay dấu chấm của số thập phân/viết tắt bằng PROTECTED_DOT để không bị coi là hết câu."""
    text = _DECIMAL_RE.sub(PROTECTED_DOT, text)
    text = _TITLES_RE.sub(lambda m: m.group(0)[:-1] + PROTECTED_DOT, text)
    text = _ETC_RE.sub("etc" + PROTECTED_DOT, text)

    def dotted(m: re.Match[str]) -> str:
        inner = m.group(0)[:-1].replace(".", PROTECTED_DOT)
        always_mid = _ALWAYS_MID_RE.fullmatch(m.group(0)) is not None
        ends_sentence = not always_mid and _BREAK_AFTER_RE.match(m.string, m.end()) is not None
        return inner + ("." if ends_sentence else PROTECTED_DOT)

    return _DOTTED_RE.sub(dotted, text)


def split_sentences(text: str) -> list[str]:
    """Tách theo . ! ? (không tách sau viết tắt); câu quá dài được tách thêm tại , ; :."""
    flat = protect_abbreviations(re.sub(r"\s+", " ", text.replace(PROTECTED_DOT, "")).strip())
    if not flat:
        return []
    raw = [s.strip() for s in _SENTENCE_RE.findall(flat) if s.strip()]
    out: list[str] = []
    for s in raw:
        if _word_count(s) <= MAX_WORDS:
            out.append(s)
            continue
        buf = ""
        for piece in _COMMA_SPLIT_RE.split(s):
            buf = buf + " " + piece if buf else piece
            if _word_count(buf) >= MIN_CHUNK_WORDS:
                out.append(buf)
                buf = ""
        if buf:
            if out:
                out[-1] += " " + buf
            else:
                out.append(buf)
    return [s.replace(PROTECTED_DOT, ".") for s in out]


def frame_rms(data: array.array, sample_rate: int) -> list[float]:
    """Giá trị RMS của từng khung 50 ms."""
    frame = math.floor(sample_rate * FRAME_SEC)
    if frame <= 0:
        return []
    rms: list[float] = []
    for i in range(0, len(data) - frame + 1, frame):
        total = 0.0
        for v in data[i : i + frame]:
            total += v * v
        rms.append(math.sqrt(total / frame))
    return rms


def silence_threshold(rms: list[float]) -> float:
    mean = sum(rms) / max(1, len(rms))
    return max(SILENCE_FLOOR, mean * SILENCE_MEAN_FACTOR)


def find_silences_from_rms(rms: list[float]) -> list[float]:
    """Điểm giữa (giây) của các quãng im lặng dài từ 0.3 s trở lên."""
    threshold = silence_threshold(rms)
    mids: list[float] = []
    run = 0
    for idx, v in enumerate(rms):
        if v < threshold:
            run += 1
        else:
            if run >= MIN_SILENCE_FRAMES:
                mids.append((idx - run / 2) * FRAME_SEC)
            run = 0
    return mids


def find_silences(data: array.array, sample_rate: int) -> list[float]:
    return find_silences_from_rms(frame_rms(data, sample_rate))


def edge_silence(rms: list[float]) -> tuple[float, float]:
    """Độ dài (giây) quãng im lặng ở đầu và ở cuối file."""
    if not rms:
        return 0.0, 0.0
    threshold = silence_threshold(rms)
    lead = 0
    while lead < len(rms) and rms[lead] < threshold:
        lead += 1
    trail = 0
    while trail < len(rms) - lead and rms[len(rms) - 1 - trail] < threshold:
        trail += 1
    return lead * FRAME_SEC, trail * FRAME_SEC


def align_sentences(texts: list[str], duration: float, silences: list[float]) -> list[dict[str, Any]]:
    """Chia thời lượng theo độ dài chữ, mốc mỗi câu hít vào quãng im lặng gần nhất (trong 2 s)."""
    n = len(texts)
    total = sum(len(t) for t in texts) or 1
    roomy = duration >= n * MIN_GAP
    bounds = [0.0]
    cum = 0
    for k in range(n - 1):
        cum += len(texts[k])
        if roomy:
            b = (duration * cum) / total
            best: float | None = None
            best_dist = SNAP_RADIUS
            for s in silences:
                d = abs(s - b)
                if d < best_dist:
                    best_dist = d
                    best = s
            if best is not None:
                b = best
            # Mỗi câu (câu này và n-1-k câu sau) giữ ít nhất MIN_GAP giây.
            lo = bounds[k] + MIN_GAP
            hi = duration - (n - 1 - k) * MIN_GAP
            b = min(max(b, lo), hi)
        else:
            b = (duration * (k + 1)) / n  # quá ngắn để đủ MIN_GAP: chia đều
        bounds.append(b)
    if n > 0:
        bounds.append(duration)
    return [
        {
            "text": text,
            "start": round2(bounds[k]),
            "end": round2(min(duration, bounds[k + 1] + TAIL_PAD)),
        }
        for k, text in enumerate(texts)
    ]


# --------------------------------------------------------------------------------------------
# Đọc và làm sạch transcript
# --------------------------------------------------------------------------------------------
_SINGLE_QUOTES = {ord(c): "'" for c in "‘’‚‛′ʼ"}
_DOUBLE_QUOTES = {ord(c): '"' for c in "“”„‟″«»"}
_ELLIPSIS_RE = re.compile(r"\.{3,}|…")
# Nhãn người nói ở đầu dòng, tối đa 2 từ: "Anna: ", "Mr. Smith: "
_SPEAKER_RE = re.compile(r"^\s*[A-Z][A-Za-z.'-]*(?: [A-Z][A-Za-z.'-]*)?:\s+")
_ENDS_SENTENCE_RE = re.compile(r"[.!?][)\]}]*$")
_DASH_LINE_RE = re.compile(r"^-{3,}$")


def clean_transcript(raw: str) -> tuple[str, list[str]]:
    """Làm sạch transcript. Trả về (văn bản một dòng, các dòng đã được thêm dấu chấm).

    - đổi nháy cong thành nháy thẳng, bỏ nháy kép, thay "..." / "…" bằng khoảng trắng;
    - bỏ nhãn người nói ở đầu dòng; nối các dòng bằng khoảng trắng;
    - dòng không kết thúc bằng . ! ? thì thêm dấu chấm. Dòng kết thúc bằng , ; : được xem là
      câu còn tiếp ở dòng sau nên để nguyên, trừ dòng cuối cùng (đổi thành dấu chấm).
    """
    text = raw.replace("\r\n", "\n").replace("\r", "\n").replace(" ", " ")
    text = text.translate(_SINGLE_QUOTES).translate(_DOUBLE_QUOTES).replace('"', "")
    text = _ELLIPSIS_RE.sub(" ", text)

    lines: list[str] = []
    for line in text.split("\n"):
        line = _SPEAKER_RE.sub("", line)
        line = re.sub(r"\s+", " ", line).strip()
        if line and not _DASH_LINE_RE.match(line):
            lines.append(line)

    added: list[str] = []
    for i, line in enumerate(lines):
        last = i == len(lines) - 1
        if _ENDS_SENTENCE_RE.search(line):
            continue
        if line[-1] in ",;:":
            if not last:
                continue  # câu còn tiếp ở dòng sau
            line = line.rstrip(",;:").rstrip()
        lines[i] = line + "."
        added.append(lines[i])
    return " ".join(lines), added


@dataclass
class Meta:
    title: str
    url: str
    level: str
    order: int | None
    url_is_default: bool


def parse_lesson_text(raw: str) -> tuple[dict[str, str], str, list[str]]:
    """Tách phần đầu (nếu có dòng '---') khỏi transcript. Trả về (header, transcript, cảnh báo)."""
    lines = raw.lstrip("﻿").replace("\r\n", "\n").replace("\r", "\n").split("\n")
    sep = next((i for i, line in enumerate(lines) if line.strip() == "---"), None)
    if sep is None:
        return {}, "\n".join(lines), []
    header: dict[str, str] = {}
    warnings: list[str] = []
    for line in lines[:sep]:
        if not line.strip():
            continue
        m = re.match(r"^\s*([A-Za-z_]+)\s*:\s*(.*?)\s*$", line)
        if not m:
            raise LessonError(
                f'Dòng đầu file không đúng dạng "khóa: giá trị": "{line.strip()}". '
                "Phần trước dòng --- chỉ được có title, url, level, order."
            )
        key = m.group(1).lower()
        if key in IGNORED_HEADER_KEYS:
            continue
        if key not in HEADER_KEYS:
            warnings.append(f'Bỏ qua khóa không biết trong phần đầu: "{m.group(1)}".')
            continue
        header[key] = m.group(2)
    return header, "\n".join(lines[sep + 1 :]), warnings


def resolve_meta(lesson_id: str, header: dict[str, str], levels: tuple[str, ...]) -> tuple[Meta, list[str]]:
    warnings: list[str] = []
    level = header.get("level", "").strip().upper() or DEFAULT_LEVEL
    if level not in levels:
        raise LessonError(f'level "{level}" không hợp lệ (chỉ nhận: {", ".join(levels)}).')
    order: int | None = None
    if header.get("order", "").strip():
        text = header["order"].strip()
        if not re.fullmatch(r"[0-9]+", text) or int(text) < 1:
            raise LessonError(f'order "{text}" phải là số nguyên từ 1 trở lên.')
        order = int(text)
    url = header.get("url", "").strip()
    url_is_default = not url
    if url_is_default:
        url = DEFAULT_URL
        warnings.append(
            f"CẢNH BÁO: chưa có dòng url trong phần đầu file, dùng địa chỉ chung {DEFAULT_URL}. "
            "Hãy thêm url của trang bài học để ghi đúng nguồn."
        )
    elif not re.match(r"^https?://", url, re.IGNORECASE):
        raise LessonError(f'url "{url}" phải bắt đầu bằng http:// hoặc https://.')
    meta = Meta(
        title=header.get("title", "").strip() or lesson_id,
        url=url,
        level=level,
        order=order,
        url_is_default=url_is_default,
    )
    return meta, warnings


def check_id(lesson_id: str) -> None:
    if not ID_RE.match(lesson_id) or not re.search(r"[a-z0-9]", lesson_id):
        suggestion = re.sub(r"[^a-z0-9]+", "-", lesson_id.lower()).strip("-")
        hint = f' Gợi ý: đổi tên cả hai file thành "{suggestion}".' if suggestion else ""
        raise LessonError(
            f'Mã bài "{lesson_id}" không hợp lệ: chỉ được dùng chữ thường a-z, số 0-9 và dấu gạch ngang.{hint}'
        )


def load_levels(root: Path) -> tuple[str, ...]:
    """Đọc LEVELS từ src/lib/types.ts để luôn khớp với app; dự phòng DEFAULT_LEVELS."""
    try:
        text = (root / "src" / "lib" / "types.ts").read_text(encoding="utf-8")
        m = re.search(r"LEVELS[^=]*=\s*\[([^\]]*)\]", text)
        values = re.findall(r"'([A-Za-z0-9]+)'", m.group(1)) if m else []
        if values:
            return tuple(values)
    except OSError:
        pass
    return DEFAULT_LEVELS


# --------------------------------------------------------------------------------------------
# Bài học: dựng và kiểm tra (theo parseStaticLesson trong src/lib/catalog.ts)
# --------------------------------------------------------------------------------------------
def build_lesson(
    lesson_id: str,
    meta: Meta,
    duration: float,
    aligned: list[dict[str, Any]],
    created_at_ms: int,
) -> dict[str, Any]:
    """Thứ tự khóa giống bài voa-l01-welcome trong index.json."""
    lesson: dict[str, Any] = {
        "id": lesson_id,
        "kind": "static",
        "title": meta.title,
        "langId": "en",
        "createdAt": created_at_ms,
        "audioUrl": f"lessons/voa/{lesson_id}.mp3",
        "duration": duration,
        "sentences": [
            {"id": f"{lesson_id}-{n}", "text": s["text"], "start": s["start"], "end": s["end"]}
            for n, s in enumerate(aligned, start=1)
        ],
        "level": meta.level,
        "source": {"name": DEFAULT_SOURCE_NAME, "url": meta.url, "license": DEFAULT_LICENSE},
    }
    if meta.order is not None:
        lesson["order"] = meta.order
    return lesson


def _is_number(v: Any) -> bool:
    return isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(v)


def _text(v: Any) -> bool:
    return isinstance(v, str) and bool(v.strip())


def validate_lesson(lesson: dict[str, Any], levels: tuple[str, ...] = DEFAULT_LEVELS) -> list[str]:
    """Danh sách lỗi (tiếng Việt); rỗng nếu bài hợp lệ. Cùng luật với parseStaticLesson."""
    errors: list[str] = []
    if not _text(lesson.get("id")):
        errors.append("thiếu id.")
    if lesson.get("kind") != "static":
        errors.append('kind phải là "static".')
    if not _text(lesson.get("title")):
        errors.append("thiếu title.")
    if not _text(lesson.get("audioUrl")):
        errors.append("thiếu audioUrl.")
    duration = lesson.get("duration")
    if not _is_number(duration) or duration <= 0:
        errors.append("duration phải là số dương (giây).")
    if lesson.get("level") not in levels:
        errors.append(f"level phải là {' hoặc '.join(levels)}.")
    source = lesson.get("source")
    if not isinstance(source, dict) or not all(_text(source.get(k)) for k in ("name", "url", "license")):
        errors.append("source cần đủ name, url và license.")
    if "order" in lesson:
        order = lesson["order"]
        if not isinstance(order, int) or isinstance(order, bool) or order < 1:
            errors.append("order phải là số nguyên từ 1 trở lên.")

    sentences = lesson.get("sentences")
    if not isinstance(sentences, list) or not sentences:
        errors.append("thiếu danh sách câu (sentences).")
        return errors
    seen: set[str] = set()
    limit = duration + 0.01 if _is_number(duration) else None
    for n, s in enumerate(sentences, start=1):
        if not isinstance(s, dict):
            errors.append(f"câu {n} sai định dạng.")
            continue
        if not _text(s.get("text")):
            errors.append(f"câu {n} chưa có chữ (text).")
        start, end = s.get("start"), s.get("end")
        if not _is_number(start) or not _is_number(end):
            errors.append(f"câu {n} thiếu start/end dạng số.")
        elif start < 0 or end <= start or (limit is not None and end > limit):
            errors.append(f"câu {n} có thời gian không hợp lệ (cần 0 <= start < end <= duration).")
        sid = s.get("id")
        if not _text(sid):
            errors.append(f"câu {n} thiếu id.")
        elif sid in seen:
            errors.append(f'câu {n} trùng id "{sid}".')
        else:
            seen.add(sid)
    return errors


def lesson_warnings(
    sentences: list[dict[str, Any]],
    duration: float,
    lead_sec: float,
    trail_sec: float,
    silence_count: int | None = None,
) -> list[str]:
    """Những điểm đáng kiểm tra bằng tai (không làm bài bị từ chối)."""
    out: list[str] = []
    if silence_count == 0 and len(sentences) > 1:
        out.append(
            "Không tìm thấy quãng im lặng nào (audio liền mạch hoặc có nhạc nền): mốc thời gian chỉ ước lượng "
            "theo độ dài chữ, hãy nghe thử kỹ từng câu."
        )
    for n, s in enumerate(sentences, start=1):
        words = len(s["text"].split())
        if words > LONG_SENTENCE_WORDS:
            out.append(f"Câu {n} có {words} từ (nhiều hơn {LONG_SENTENCE_WORDS}): nên tách ngắn hơn.")
        length = s["end"] - s["start"]
        if length < SHORT_SENTENCE_SEC:
            out.append(f"Câu {n} chỉ dài {length:.2f} giây (dưới {SHORT_SENTENCE_SEC}): kiểm tra mốc thời gian.")
        if s["text"].rstrip().endswith(","):
            out.append(f"Câu {n} kết thúc bằng dấu phẩy: kiểm tra lại cách tách câu.")
    if lead_sec > EDGE_SILENCE_SEC:
        out.append(f"Đầu file im lặng {lead_sec:.1f} giây: câu 1 bắt đầu từ 0 nên sẽ có đoạn trống trước khi nói.")
    if trail_sec > EDGE_SILENCE_SEC:
        out.append(f"Cuối file im lặng {trail_sec:.1f} giây: câu cuối kéo dài đến hết file.")
    if duration > MAX_UPLOAD_SEC:
        out.append(f"Audio dài {duration / 60:.1f} phút (hơn 10 phút).")
    return out


def format_table(sentences: list[dict[str, Any]], width: int = 72) -> str:
    rows = [f"{'n':>3}  {'bắt đầu':>8}  {'kết thúc':>8}  câu"]
    for n, s in enumerate(sentences, start=1):
        text = s["text"] if len(s["text"]) <= width else s["text"][: width - 1] + "…"
        rows.append(f"{n:>3}  {s['start']:>8.2f}  {s['end']:>8.2f}  {text}")
    return "\n".join(rows)


# --------------------------------------------------------------------------------------------
# index.json: đọc, cập nhật, ghi an toàn
# --------------------------------------------------------------------------------------------
def load_catalog(path: Path) -> dict[str, Any]:
    try:
        data = json.loads(path.read_text(encoding="utf-8-sig"))
    except FileNotFoundError:
        raise LessonError(f"Không thấy {path}.") from None
    except json.JSONDecodeError as e:
        raise LessonError(f"{path} không phải JSON hợp lệ: {e}") from None
    if not isinstance(data, dict) or not isinstance(data.get("lessons"), list):
        raise LessonError(f'{path} thiếu mảng "lessons".')
    return data


def dump_catalog(catalog: dict[str, Any]) -> str:
    """Cùng định dạng với file hiện có: thụt lề 2 dấu cách, UTF-8, xuống dòng cuối."""
    return json.dumps(catalog, indent=2, ensure_ascii=False) + "\n"


def update_catalog(catalog: dict[str, Any], lesson: dict[str, Any], force: bool) -> tuple[dict[str, Any], str]:
    """Thêm bài (hoặc thay bài cùng id khi force). Không sửa catalog đầu vào.

    Trả về (catalog mới, 'added' | 'replaced' | 'skipped').
    """
    lessons = list(catalog["lessons"])
    index = next((i for i, x in enumerate(lessons) if isinstance(x, dict) and x.get("id") == lesson["id"]), None)
    if index is None:
        lessons.append(lesson)
        status = "added"
    elif force:
        lessons[index] = lesson
        status = "replaced"
    else:
        return catalog, "skipped"
    return {**catalog, "lessons": lessons}, status


def write_catalog(path: Path, catalog: dict[str, Any]) -> None:
    """Sao lưu index.json.bak, ghi file tạm cùng thư mục rồi os.replace (không bao giờ ghi dở)."""
    if path.exists():
        shutil.copyfile(path, path.with_name(path.name + ".bak"))
    fd, tmp_name = tempfile.mkstemp(dir=path.parent, prefix=path.name + ".", suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8", newline="\n") as f:
            f.write(dump_catalog(catalog))
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp_name, path)
    except BaseException:
        Path(tmp_name).unlink(missing_ok=True)  # chỉ xóa file tạm do chính script tạo
        raise


def catalog_ids(catalog: dict[str, Any]) -> set[str]:
    return {x["id"] for x in catalog["lessons"] if isinstance(x, dict) and isinstance(x.get("id"), str)}


# --------------------------------------------------------------------------------------------
# ffmpeg / ffprobe
# --------------------------------------------------------------------------------------------
INSTALL_HINT = (
    "Không tìm thấy {name}. Cài ffmpeg bằng lệnh:\n"
    "    winget install --id Gyan.FFmpeg -e\n"
    "rồi mở lại cửa sổ terminal (hoặc thêm thư mục bin của ffmpeg vào PATH)."
)


def find_tool(name: str, environ: dict[str, str] | None = None) -> str | None:
    """shutil.which trước, rồi tìm trong thư mục cài của winget (Gyan.FFmpeg)."""
    found = shutil.which(name)
    if found:
        return found
    env = os.environ if environ is None else environ
    local = env.get("LOCALAPPDATA")
    if local:
        base = Path(local) / "Microsoft" / "WinGet" / "Packages"
        hits = sorted(base.glob(f"Gyan.FFmpeg*/**/bin/{name}.exe"))
        if hits:
            return str(hits[-1])
    return None


def _run(cmd: list[str], what: str) -> subprocess.CompletedProcess[bytes]:
    try:
        proc = subprocess.run(cmd, capture_output=True)
    except OSError as e:
        raise LessonError(f"Không chạy được {what}: {e}") from None
    if proc.returncode != 0:
        tail = proc.stderr.decode("utf-8", "replace").strip().splitlines()[-1:] or [""]
        raise LessonError(f"{what} báo lỗi: {tail[0]}")
    return proc


def probe_duration(ffprobe: str, path: Path) -> float:
    proc = _run(
        [ffprobe, "-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", str(path)],
        "ffprobe",
    )
    try:
        value = float(proc.stdout.decode().strip())
    except ValueError:
        raise LessonError(f"Không đọc được độ dài của {path.name}.") from None
    if not math.isfinite(value) or value <= 0:
        raise LessonError(f"Độ dài của {path.name} không hợp lệ ({value}).")
    return value


def convert_audio(ffmpeg: str, src: Path, dst: Path) -> None:
    """Mono, 48 kbps, bỏ metadata."""
    _run(
        [ffmpeg, "-v", "error", "-y", "-i", str(src), "-vn", "-ac", "1", "-b:a", "48k", "-map_metadata", "-1", str(dst)],
        "ffmpeg (chuyển audio)",
    )


def decode_samples(ffmpeg: str, path: Path) -> array.array:
    """Giải mã thành mono float32 16 kHz (qua stdout) để tìm quãng im lặng."""
    proc = _run(
        [ffmpeg, "-v", "error", "-i", str(path), "-vn", "-f", "f32le", "-ac", "1", "-ar", str(SAMPLE_RATE), "-"],
        "ffmpeg (giải mã)",
    )
    data = array.array("f")
    data.frombytes(proc.stdout[: len(proc.stdout) // 4 * 4])
    if sys.byteorder == "big":
        data.byteswap()
    return data


# --------------------------------------------------------------------------------------------
# Quy trình cho từng bài
# --------------------------------------------------------------------------------------------
@dataclass
class Context:
    root: Path
    catalog_path: Path
    ffmpeg: str | None
    ffprobe: str | None
    levels: tuple[str, ...] = DEFAULT_LEVELS
    force: bool = False
    dry_run: bool = False
    keep_inbox: bool = False
    out: Any = field(default=print)

    @property
    def inbox(self) -> Path:
        return self.root / "inbox" / "lessons"

    @property
    def audio_dir(self) -> Path:
        return self.root / "public" / "lessons" / "voa"


@dataclass
class Item:
    lesson_id: str
    audio: Path
    text: Path


@dataclass
class Result:
    lesson_id: str
    status: str  # 'ok' | 'dry' | 'skipped' | 'failed'
    message: str = ""


def discover(inbox: Path, only_id: str | None = None) -> tuple[list[Item], list[str]]:
    """Cặp <id>.(mp3|m4a|wav) + <id>.txt trong inbox/lessons (không đi vào thư mục done)."""
    notes: list[str] = []
    items: list[Item] = []
    if not inbox.is_dir():
        return items, [f"Không thấy thư mục {inbox}."]
    audio_by_stem: dict[str, list[Path]] = {}
    for p in sorted(inbox.iterdir()):
        if p.is_file() and p.suffix.lower() in AUDIO_EXTS:
            audio_by_stem.setdefault(p.stem, []).append(p)
    stems = [only_id] if only_id else sorted(audio_by_stem)
    for stem in stems:
        files = audio_by_stem.get(stem, [])
        txt = inbox / f"{stem}.txt"
        if only_id and not files:
            notes.append(f'Không thấy file audio {stem}.mp3/.m4a/.wav trong {inbox}.')
            continue
        if not txt.is_file():
            notes.append(f"Bỏ qua {files[0].name}: chưa có file {stem}.txt cùng tên.")
            continue
        if len(files) > 1:
            notes.append(f'Bỏ qua "{stem}": có nhiều file audio cùng tên ({", ".join(f.name for f in files)}).')
            continue
        items.append(Item(stem, files[0], txt))
    return items, notes


def _unique_destination(folder: Path, name: str) -> Path:
    dest = folder / name
    if not dest.exists():
        return dest
    stamp = time.strftime("%Y%m%d-%H%M%S")
    return folder / f"{dest.stem}-{stamp}{dest.suffix}"


def move_files_to_done(files: list[Path], inbox: Path) -> list[Path]:
    """Chuyển file đã xử lý sang inbox/lessons/done/ (không bao giờ xóa, không ghi đè)."""
    done = inbox / "done"
    done.mkdir(parents=True, exist_ok=True)
    moved = []
    for src in files:
        dest = _unique_destination(done, src.name)
        shutil.move(str(src), str(dest))
        moved.append(dest)
    return moved


def move_to_done(item: Item, inbox: Path) -> list[Path]:
    return move_files_to_done([item.audio, item.text], inbox)


def process_item(item: Item, ctx: Context) -> Result:
    say = ctx.out
    lesson_id = item.lesson_id
    say(f'\n=== Bài "{lesson_id}" ===')
    tmp_mp3: Path | None = None
    try:
        check_id(lesson_id)
        if ctx.ffmpeg is None or ctx.ffprobe is None:
            raise LessonError(INSTALL_HINT.format(name="ffmpeg/ffprobe"))

        catalog = load_catalog(ctx.catalog_path)
        if lesson_id in catalog_ids(catalog) and not ctx.force:
            say("Bài đã có trong catalog, bỏ qua (dùng --force để thay thế).")
            return Result(lesson_id, "skipped", "đã có trong catalog")

        try:
            raw = item.text.read_text(encoding="utf-8-sig")
        except UnicodeDecodeError:
            raise LessonError(f"{item.text.name} không phải UTF-8. Hãy lưu lại file với mã hóa UTF-8.") from None
        header, transcript, header_warnings = parse_lesson_text(raw)
        meta, meta_warnings = resolve_meta(lesson_id, header, ctx.levels)
        for w in header_warnings + meta_warnings:
            say(w)

        cleaned, added = clean_transcript(transcript)
        if added:
            say(f"Lưu ý: đã thêm dấu chấm cuối {len(added)} dòng không có dấu kết câu:")
            for line in added:
                say(f"    {line}")
        texts = split_sentences(cleaned)
        if not texts:
            raise LessonError("Transcript trống: không có câu nào.")
        say(f"Tách được {len(texts)} câu.")

        target = ctx.audio_dir / f"{lesson_id}.mp3"
        if target.exists() and not ctx.force:
            raise LessonError(f"{target} đã tồn tại. Dùng --force để ghi đè (file cũ được giữ thành .bak).")

        if ctx.dry_run:
            analysis_src = item.audio
            say("[CHẠY THỬ] Không chuyển audio; đo độ dài và quãng im lặng từ file gốc (số liệu chỉ để xem trước).")
        else:
            ctx.audio_dir.mkdir(parents=True, exist_ok=True)
            tmp_mp3 = ctx.audio_dir / f"{lesson_id}.tmp.mp3"
            say(f"Đang chuyển audio sang mono 48 kbps: {target.name} ...")
            convert_audio(ctx.ffmpeg, item.audio, tmp_mp3)
            analysis_src = tmp_mp3

        duration = round(probe_duration(ctx.ffprobe, analysis_src), 6)
        samples = decode_samples(ctx.ffmpeg, analysis_src)
        rms = frame_rms(samples, SAMPLE_RATE)
        silences = find_silences_from_rms(rms)
        lead, trail = edge_silence(rms)
        say(f"Độ dài {duration:.2f} giây; tìm thấy {len(silences)} quãng im lặng.")

        aligned = align_sentences(texts, duration, silences)
        lesson = build_lesson(lesson_id, meta, duration, aligned, int(time.time() * 1000))
        errors = validate_lesson(lesson, ctx.levels)
        if errors:
            raise LessonError("Bài không hợp lệ:\n    - " + "\n    - ".join(errors))

        say("\n" + format_table(lesson["sentences"]))
        warnings = lesson_warnings(lesson["sentences"], duration, lead, trail, len(silences))
        if warnings:
            say("\nCần kiểm tra:")
            for w in warnings:
                say(f"  ! {w}")

        if ctx.dry_run:
            say(f"\n[CHẠY THỬ] Kế hoạch (chưa ghi gì):")
            say(f"  - chuyển {item.audio.name} -> {target}")
            say(f"  - {'thay thế' if lesson_id in catalog_ids(catalog) else 'thêm'} bài vào {ctx.catalog_path}")
            if not ctx.keep_inbox:
                say(f"  - chuyển {item.audio.name} và {item.text.name} vào {ctx.inbox / 'done'}")
            return Result(lesson_id, "dry")

        # Ghi thật: audio trước, rồi index.json, rồi dọn inbox.
        if target.exists():
            shutil.copyfile(target, target.with_name(target.name + ".bak"))
        assert tmp_mp3 is not None
        os.replace(tmp_mp3, target)
        tmp_mp3 = None
        new_catalog, status = update_catalog(catalog, lesson, ctx.force)
        write_catalog(ctx.catalog_path, new_catalog)
        say(f"\nĐã {'thay thế' if status == 'replaced' else 'thêm'} bài vào {ctx.catalog_path} (bản sao lưu: index.json.bak).")
        if not ctx.keep_inbox:
            moved = move_to_done(item, ctx.inbox)
            say(f"Đã chuyển file gốc vào {moved[0].parent}.")
        return Result(lesson_id, "ok")
    except LessonError as e:
        say(f"LỖI: {e}")
        return Result(lesson_id, "failed", str(e))
    finally:
        if tmp_mp3 is not None:
            tmp_mp3.unlink(missing_ok=True)  # chỉ xóa file tạm do chính script tạo


# --------------------------------------------------------------------------------------------
# Chỉ chuyển audio (--audio-only)
# --------------------------------------------------------------------------------------------
def audio_by_stem(inbox: Path) -> dict[str, list[Path]]:
    """File audio ngay trong inbox/lessons (không đi vào thư mục done), nhóm theo tên không đuôi."""
    found: dict[str, list[Path]] = {}
    if inbox.is_dir():
        for p in sorted(inbox.iterdir()):
            if p.is_file() and p.suffix.lower() in AUDIO_EXTS:
                found.setdefault(p.stem, []).append(p)
    return found


def fmt_size(n: int) -> str:
    if n >= 1024 * 1024:
        return f"{n / (1024 * 1024):.2f} MB"
    return f"{n / 1024:.1f} KB"


def convert_to_catalog_audio(ctx: Context, src: Path, target: Path) -> None:
    """Chuyển src thành target (mono, 48 kbps) qua file tạm; target cũ được giữ thành .bak."""
    assert ctx.ffmpeg is not None
    ctx.audio_dir.mkdir(parents=True, exist_ok=True)
    tmp = target.with_name(target.stem + ".tmp.mp3")
    try:
        convert_audio(ctx.ffmpeg, src, tmp)
        if target.exists():
            shutil.copyfile(target, target.with_name(target.name + ".bak"))
        os.replace(tmp, target)
    finally:
        tmp.unlink(missing_ok=True)  # chỉ xóa file tạm do chính script tạo


def audio_only_item(stem: str, files: list[Path], ctx: Context) -> Result:
    say = ctx.out
    say(f'\n=== Audio "{stem}" ===')
    try:
        check_id(stem)
        if len(files) > 1:
            raise LessonError(f'Có nhiều file audio cùng tên ({", ".join(f.name for f in files)}).')
        src = files[0]
        target = ctx.audio_dir / f"{stem}.mp3"
        if target.exists() and not ctx.force:
            say(f"{target} đã tồn tại, bỏ qua (dùng --force để ghi đè).")
            return Result(stem, "skipped", "đã có file audio")
        assert ctx.ffprobe is not None
        duration = probe_duration(ctx.ffprobe, src)
        before = src.stat().st_size
        if ctx.dry_run:
            say(f"[CHẠY THỬ] {src.name}: {duration:.2f} giây, {fmt_size(before)}.")
            say(f"  - chuyển {src.name} -> {target}")
            if not ctx.keep_inbox:
                say(f"  - chuyển {src.name} vào {ctx.inbox / 'done'}")
            return Result(stem, "dry")
        say(f"Đang chuyển sang mono 48 kbps: {target.name} ...")
        convert_to_catalog_audio(ctx, src, target)
        say(f"Độ dài {duration:.2f} giây; dung lượng {fmt_size(before)} -> {fmt_size(target.stat().st_size)}.")
        if not ctx.keep_inbox:
            moved = move_files_to_done([src], ctx.inbox)
            say(f"Đã chuyển file gốc vào {moved[0].parent}.")
        return Result(stem, "ok")
    except LessonError as e:
        say(f"LỖI: {e}")
        return Result(stem, "failed", str(e))


def run_audio_only(ctx: Context, only_id: str | None) -> int:
    say = ctx.out
    if ctx.ffmpeg is None or ctx.ffprobe is None:
        missing = [n for n, p in (("ffmpeg", ctx.ffmpeg), ("ffprobe", ctx.ffprobe)) if p is None]
        say("LỖI: " + INSTALL_HINT.format(name=" và ".join(missing)))
        return 1
    if only_id:
        try:
            check_id(only_id)
        except LessonError as e:
            say(f"LỖI: {e}")
            return 1
    found = audio_by_stem(ctx.inbox)
    if only_id:
        if only_id not in found:
            say(f"LỖI: Không thấy file audio {only_id}.mp3/.m4a/.wav trong {ctx.inbox}.")
            return 1
        found = {only_id: found[only_id]}
    if not found:
        say(f"Không có file audio nào trong {ctx.inbox}.")
        return 0
    results = [audio_only_item(stem, files, ctx) for stem, files in found.items()]
    counts = {k: sum(1 for r in results if r.status == k) for k in ("ok", "dry", "skipped", "failed")}
    say(
        f"\nTổng kết: {counts['ok']} file đã chuyển, {counts['dry']} chạy thử, "
        f"{counts['skipped']} bỏ qua, {counts['failed']} lỗi."
    )
    return 1 if counts["failed"] else 0


# --------------------------------------------------------------------------------------------
# Nhận bài đã xuất từ màn Review (--import-json)
# --------------------------------------------------------------------------------------------
class LessonExistsError(LessonError):
    """Bài đã có trong catalog và chưa dùng --force."""


def parse_import_text(text: str) -> dict[str, Any]:
    try:
        data = json.loads(text.lstrip("\ufeff"))
    except json.JSONDecodeError as e:
        raise LessonError(f"Nội dung không phải JSON hợp lệ: {e}") from None
    if not isinstance(data, dict):
        raise LessonError("Cần đúng MỘT bài (một đối tượng JSON), không phải danh sách hay giá trị khác.")
    return data


def import_lesson(lesson: dict[str, Any], ctx: Context) -> dict[str, Any]:
    """Nạp một bài đã xuất: kiểm tra, chuyển audio gốc (nếu có), thêm vào catalog, dọn inbox.

    Trả về {"id", "action": "added" | "replaced" | "dry", "audio"}; ném LessonError khi lỗi.
    """
    say = ctx.out
    lesson = {k: v for k, v in lesson.items() if k != "topic"}  # khóa cũ, không còn dùng
    lesson_id = lesson.get("id")
    if not isinstance(lesson_id, str):
        raise LessonError("Bài không hợp lệ:\n    - thiếu id.")
    check_id(lesson_id)
    errors = validate_lesson(lesson, ctx.levels)
    expected_audio = f"lessons/voa/{lesson_id}.mp3"
    if lesson.get("audioUrl") != expected_audio and _text(lesson.get("audioUrl")):
        errors.append(f'audioUrl phải là "{expected_audio}" (khớp với mã bài).')
    if errors:
        raise LessonError("Bài không hợp lệ:\n    - " + "\n    - ".join(errors))

    catalog = load_catalog(ctx.catalog_path)
    if lesson_id in catalog_ids(catalog) and not ctx.force:
        raise LessonExistsError(f'Bài "{lesson_id}" đã có trong danh mục. Dùng --force (hoặc "Thay bài cũ") để thay thế.')

    raws = audio_by_stem(ctx.inbox).get(lesson_id, [])
    if len(raws) > 1:
        raise LessonError(f'Có nhiều file audio cùng tên ({", ".join(f.name for f in raws)}) trong {ctx.inbox}.')
    target = ctx.audio_dir / f"{lesson_id}.mp3"
    if not raws and not target.exists():
        raise LessonError(
            f"Không tìm thấy file audio. Đặt file gốc vào inbox/lessons/{lesson_id}.mp3 (tên file = mã bài) rồi thử lại."
        )
    if raws:
        if ctx.ffmpeg is None:
            raise LessonError(INSTALL_HINT.format(name="ffmpeg"))
        if target.exists() and not ctx.force:
            raise LessonError(f"{target} đã tồn tại. Dùng --force để ghi đè (file cũ được giữ thành .bak).")

    action = "replaced" if lesson_id in catalog_ids(catalog) else "added"
    if ctx.dry_run:
        say("[CHẠY THỬ] Kế hoạch (chưa ghi gì):")
        if raws:
            say(f"  - chuyển {raws[0].name} -> {target}")
        else:
            say(f"  - dùng lại {target}")
        say(f"  - {'thay thế' if action == 'replaced' else 'thêm'} bài vào {ctx.catalog_path}")
        return {"id": lesson_id, "action": "dry", "audio": expected_audio}

    if raws:
        say(f"Đang chuyển audio sang mono 48 kbps: {target.name} ...")
        convert_to_catalog_audio(ctx, raws[0], target)
    else:
        say(f"Dùng lại audio đã chuyển: {target}")
    new_catalog, status = update_catalog(catalog, lesson, ctx.force)
    write_catalog(ctx.catalog_path, new_catalog)
    say(f"Đã {'thay thế' if status == 'replaced' else 'thêm'} bài vào {ctx.catalog_path} (bản sao lưu: index.json.bak).")
    if raws and not ctx.keep_inbox:
        moved = move_files_to_done(raws, ctx.inbox)
        say(f"Đã chuyển file gốc vào {moved[0].parent}.")
    return {"id": lesson_id, "action": status, "audio": expected_audio}


def run_import(ctx: Context, source: str, stdin_bytes: Any = None) -> int:
    """--import-json: nhật ký ra ctx.out (stderr); dòng cuối của stdout là JSON kết quả."""
    try:
        if source == "-":
            data = (stdin_bytes() if stdin_bytes else sys.stdin.buffer.read())
        else:
            try:
                data = Path(source).read_bytes()
            except OSError as e:
                raise LessonError(f"Không đọc được {source}: {e.strerror or e}") from None
        try:
            text = data.decode("utf-8-sig")
        except UnicodeDecodeError:
            raise LessonError("Nội dung không phải UTF-8.") from None
        result = import_lesson(parse_import_text(text), ctx)
        payload: dict[str, Any] = {"ok": True, **result}
        code = 0
    except LessonExistsError as e:
        ctx.out(f"LỖI: {e}")
        payload, code = {"ok": False, "error": str(e), "exists": True}, 1
    except LessonError as e:
        ctx.out(f"LỖI: {e}")
        payload, code = {"ok": False, "error": str(e)}, 1
    print(json.dumps(payload, ensure_ascii=True), flush=True)
    return code


def delete_lesson(lesson_id: str, ctx: Context) -> dict[str, Any]:
    """Bỏ một bài khỏi catalog. File mp3 không bị xóa: được chuyển vào inbox/lessons/done/ (trừ khi bài khác còn dùng).

    Trả về {"id", "action": "deleted" | "dry", "audio"}; ném LessonError khi lỗi.
    """
    say = ctx.out
    check_id(lesson_id)
    catalog = load_catalog(ctx.catalog_path)
    lessons = catalog["lessons"]
    found = [x for x in lessons if isinstance(x, dict) and x.get("id") == lesson_id]
    if not found:
        raise LessonError(f'Không có bài "{lesson_id}" trong danh mục.')
    audio_url = found[0].get("audioUrl")
    rest = [x for x in lessons if x is not found[0]]
    shared = any(isinstance(x, dict) and x.get("audioUrl") == audio_url for x in rest)
    target = ctx.audio_dir / f"{lesson_id}.mp3"
    move_audio = target.exists() and not shared and audio_url == f"lessons/voa/{lesson_id}.mp3"
    if ctx.dry_run:
        say("[CHẠY THỬ] Kế hoạch (chưa ghi gì):")
        say(f"  - bỏ bài khỏi {ctx.catalog_path}")
        if move_audio:
            say(f"  - chuyển {target} vào {ctx.inbox / 'done'}")
        return {"id": lesson_id, "action": "dry", "audio": audio_url or ""}
    write_catalog(ctx.catalog_path, {**catalog, "lessons": rest})
    say(f"Đã bỏ bài {lesson_id} khỏi {ctx.catalog_path} (bản sao lưu: index.json.bak).")
    if move_audio:
        moved = move_files_to_done([target], ctx.inbox)
        say(f"Đã chuyển {target.name} vào {moved[0].parent} (không xóa hẳn).")
    return {"id": lesson_id, "action": "deleted", "audio": audio_url or ""}


def run_delete(ctx: Context, lesson_id: str) -> int:
    """--delete-lesson: nhật ký ra ctx.out (stderr); dòng cuối của stdout là JSON kết quả."""
    try:
        payload: dict[str, Any] = {"ok": True, **delete_lesson(lesson_id, ctx)}
        code = 0
    except LessonError as e:
        ctx.out(f"LỖI: {e}")
        payload, code = {"ok": False, "error": str(e)}, 1
    print(json.dumps(payload, ensure_ascii=True), flush=True)
    return code


NEXT_STEPS = "Nghe thử từng câu; sửa mốc thời gian trong public/lessons/index.json nếu lệch; chạy npm run build và npm test."


def run(ctx: Context, only_id: str | None) -> int:
    say = ctx.out
    if ctx.ffmpeg is None or ctx.ffprobe is None:
        missing = [n for n, p in (("ffmpeg", ctx.ffmpeg), ("ffprobe", ctx.ffprobe)) if p is None]
        say("LỖI: " + INSTALL_HINT.format(name=" và ".join(missing)))
        return 1
    say(f"ffmpeg: {ctx.ffmpeg}")
    if only_id:
        try:
            check_id(only_id)
        except LessonError as e:
            say(f"LỖI: {e}")
            return 1
    items, notes = discover(ctx.inbox, only_id)
    for n in notes:
        say(n)
    if not items:
        say("Không có bài nào để xử lý.")
        return 1 if only_id else 0

    results = [process_item(item, ctx) for item in items]
    failed = [r for r in results if r.status == "failed"]
    done = [r for r in results if r.status == "ok"]
    dry = [r for r in results if r.status == "dry"]
    skipped = [r for r in results if r.status == "skipped"]
    say(
        f"\nTổng kết: {len(done)} bài đã nạp, {len(dry)} bài chạy thử, "
        f"{len(skipped)} bài bỏ qua, {len(failed)} bài lỗi."
    )
    if dry:
        say("Chạy lại không có --dry-run để ghi thật.")
    if done:
        say("\nBước tiếp theo: " + NEXT_STEPS)
    return 1 if failed else 0


def main(argv: list[str] | None = None) -> int:
    for stream in (sys.stdout, sys.stderr):
        reconfigure = getattr(stream, "reconfigure", None)
        if reconfigure:
            reconfigure(encoding="utf-8", errors="replace")  # console Windows không phải lúc nào cũng UTF-8
    parser = argparse.ArgumentParser(
        description="Nạp bài học có sẵn từ inbox/lessons/<id>.(mp3|m4a|wav) + <id>.txt vào public/lessons/index.json.",
    )
    parser.add_argument("--id", dest="only_id", help="chỉ xử lý bài có mã này")
    parser.add_argument("--force", action="store_true", help="thay thế bài đã có cùng id (và ghi đè mp3 đã có)")
    parser.add_argument("--dry-run", action="store_true", help="chạy thử: in kế hoạch và bảng câu, không ghi gì")
    parser.add_argument("--keep-inbox", action="store_true", help="không chuyển file gốc sang inbox/lessons/done/")
    parser.add_argument("--audio-only", action="store_true", help="chỉ chuyển audio inbox/lessons -> public/lessons/voa (không cần .txt)")
    parser.add_argument("--import-json", metavar="FILE", help='nhận một bài đã xuất từ màn Review ("-" = stdin) và thêm vào index.json')
    parser.add_argument("--delete-lesson", metavar="ID", help="bỏ bài có mã này khỏi index.json (mp3 được chuyển vào inbox/lessons/done/, không xóa hẳn)")
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parent, help=argparse.SUPPRESS)
    parser.add_argument("--catalog", type=Path, help="đường dẫn index.json khác (mặc định: public/lessons/index.json)")
    args = parser.parse_args(argv)

    if args.audio_only and args.import_json is not None:
        parser.error("--audio-only và --import-json không dùng cùng lúc.")
    if args.delete_lesson is not None and (args.audio_only or args.import_json is not None):
        parser.error("--delete-lesson không dùng cùng --audio-only hoặc --import-json.")
    root: Path = args.root.resolve()
    deleting = args.delete_lesson is not None
    importing = args.import_json is not None or deleting
    ctx = Context(
        root=root,
        catalog_path=(args.catalog or root / "public" / "lessons" / "index.json").resolve(),
        ffmpeg=find_tool("ffmpeg"),
        ffprobe=find_tool("ffprobe"),
        levels=load_levels(root),
        force=args.force,
        dry_run=args.dry_run,
        keep_inbox=args.keep_inbox,
        # --import-json: stdout chỉ dành cho dòng JSON kết quả, nhật ký đi vào stderr.
        out=(lambda line: print(line, file=sys.stderr, flush=True)) if importing else print,
    )
    if deleting:
        return run_delete(ctx, args.delete_lesson)
    if importing:
        return run_import(ctx, args.import_json)
    if args.audio_only:
        return run_audio_only(ctx, args.only_id)
    return run(ctx, args.only_id)


if __name__ == "__main__":
    sys.exit(main())
